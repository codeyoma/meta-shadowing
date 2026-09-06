-- The first draft anchors a stable lesson ID. Later drafts are immutable versions
-- of that lesson; their separate folders keep replacement uploads off live audio.
alter table public.lesson_drafts
  add column lesson_id uuid references public.lesson_drafts(id) on delete cascade,
  add column deletion_started_at timestamptz,
  add column cleanup_error text;
update public.lesson_drafts set lesson_id = id;
alter table public.lesson_drafts alter column lesson_id set not null;
create index lesson_drafts_lesson_id_idx on public.lesson_drafts(lesson_id);

alter table public.lesson_drafts
  drop constraint lesson_drafts_publication_status_check,
  drop constraint lesson_drafts_publication_is_complete,
  add constraint lesson_drafts_publication_status_check
    check (publication_status in ('draft', 'published', 'unpublished', 'archived')),
  add constraint lesson_drafts_publication_is_complete check (
    (publication_status = 'draft' and published_at is null)
    or (publication_status in ('published', 'unpublished', 'archived')
      and published_at is not null and validation_status = 'validated'
      and jsonb_array_length(validation_issues) = 0 and phrase_count > 0
      and jsonb_array_length(audio_manifest) = phrase_count)
  );
create unique index lesson_drafts_one_published_version
  on public.lesson_drafts(lesson_id) where publication_status = 'published';

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create function private.guard_lesson_version() returns trigger
language plpgsql security invoker set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    new.lesson_id := coalesce(new.lesson_id, new.id);
    if current_user = 'authenticated' and (
      new.lesson_id <> new.id or new.publication_status <> 'draft'
      or new.published_at is not null or new.audio_manifest <> '[]'::jsonb
      or new.deletion_started_at is not null or new.cleanup_error is not null
    ) then
      raise exception using errcode = '42501', message = 'use the lesson lifecycle API';
    end if;
  elsif current_user = 'authenticated' and old.published_at is not null then
    raise exception using errcode = '42501', message = 'published versions are immutable; import a replacement';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_lesson_version() from public;
create trigger guard_lesson_version before insert or update on public.lesson_drafts
  for each row execute function private.guard_lesson_version();
revoke delete on public.lesson_drafts from authenticated;
grant select, insert, update, delete on public.lesson_drafts to service_role;

-- Preserve the existing manifest validation in a non-exposed implementation.
alter function public.publish_lesson_draft(uuid, uuid, jsonb) set schema private;
alter function private.publish_lesson_draft(uuid, uuid, jsonb) security invoker;

create function public.publish_lesson_draft(p_draft_id uuid, p_admin_id uuid, p_audio_manifest jsonb)
returns timestamptz language plpgsql security invoker set search_path = '' as $function$
declare
  draft public.lesson_drafts%rowtype;
  root public.lesson_drafts%rowtype;
begin
  select * into draft from public.lesson_drafts where id = p_draft_id and created_by = p_admin_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'lesson draft not found';
  end if;
  select * into root from public.lesson_drafts where id = draft.lesson_id and created_by = p_admin_id for update;
  if not found or root.deletion_started_at is not null then
    raise exception using errcode = '55000', message = 'lesson is being deleted';
  end if;
  -- Re-read after the aggregate lock; concurrent publish/delete calls serialize.
  select * into draft from public.lesson_drafts where id = p_draft_id for update;
  if draft.publication_status = 'archived' then
    raise exception using errcode = '55000', message = 'this lesson version was replaced';
  end if;
  if draft.published_at is not null then
    if jsonb_array_length(p_audio_manifest) <> draft.phrase_count then
      raise exception using errcode = '23514', message = 'audio manifest is incomplete';
    end if;
    if p_audio_manifest <> draft.audio_manifest then
      raise exception using errcode = '55000', message = 'published versions are immutable';
    end if;
    update public.lesson_drafts set publication_status = 'published' where id = p_draft_id;
    return draft.published_at;
  end if;
  update public.lesson_drafts set publication_status = 'archived'
    where lesson_id = draft.lesson_id and publication_status in ('published', 'unpublished');
  return private.publish_lesson_draft(p_draft_id, p_admin_id, p_audio_manifest);
end;
$function$;
revoke all on function public.publish_lesson_draft(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.publish_lesson_draft(uuid, uuid, jsonb) to service_role;

create function public.import_lesson_replacement(p_lesson_id uuid, p_admin_id uuid, p_draft jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $function$
declare
  root public.lesson_drafts%rowtype;
  new_id uuid;
begin
  select * into root from public.lesson_drafts
    where id = p_lesson_id and lesson_id = id and created_by = p_admin_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'lesson not found';
  end if;
  if root.deletion_started_at is not null or root.published_at is null then
    raise exception using errcode = '55000', message = 'lesson cannot be replaced';
  end if;
  if p_draft ->> 'language' <> root.language then
    raise exception using errcode = '23514', message = 'replacement language must match the lesson';
  end if;
  insert into public.lesson_drafts (
    lesson_id, created_by, title, language, target_filename, korean_filename,
    target_source, korean_source, parsed_entries, validation_issues, validation_status,
    phrase_count, chapter_count, section_count
  ) select p_lesson_id, p_admin_id, d.title, d.language, d.target_filename, d.korean_filename,
    d.target_source, d.korean_source, d.parsed_entries, d.validation_issues, d.validation_status,
    d.phrase_count, d.chapter_count, d.section_count
  from jsonb_to_record(p_draft) as d(title text, language text, target_filename text, korean_filename text,
    target_source text, korean_source text, parsed_entries jsonb, validation_issues jsonb, validation_status text,
    phrase_count integer, chapter_count integer, section_count integer)
  returning id into new_id;
  return new_id;
end;
$function$;
revoke all on function public.import_lesson_replacement(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_lesson_replacement(uuid, uuid, jsonb) to service_role;

-- Storage writes share the aggregate lock with publication and deletion. Only
-- unpublished drafts can change bytes, never a version a learner has loaded.
create function private.lesson_audio_is_writable(object_name text) returns boolean
language plpgsql security invoker set search_path = '' as $function$
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin'
    or (storage.foldername(object_name))[1] <> (select auth.uid())::text
    or array_length(storage.foldername(object_name), 1) <> 2 then return false; end if;
  perform root.id from public.lesson_drafts draft
    join public.lesson_drafts root on root.id = draft.lesson_id
    where draft.id::text = (storage.foldername(object_name))[2]
      and draft.created_by = (select auth.uid()) and root.created_by = (select auth.uid())
      and draft.published_at is null and root.deletion_started_at is null
    for share of root;
  return found;
end;
$function$;
revoke all on function private.lesson_audio_is_writable(text) from public;
grant execute on function private.lesson_audio_is_writable(text) to authenticated;
alter policy "Lesson audio administrators can upload own objects" on storage.objects
  with check (bucket_id = 'lesson-audio' and private.lesson_audio_is_writable(name));
alter policy "Lesson audio administrators can replace own objects" on storage.objects
  using (bucket_id = 'lesson-audio' and private.lesson_audio_is_writable(name))
  with check (bucket_id = 'lesson-audio' and private.lesson_audio_is_writable(name));
alter policy "Lesson audio administrators can delete own objects" on storage.objects
  using (bucket_id = 'lesson-audio' and private.lesson_audio_is_writable(name));

create function public.unpublish_lesson(p_lesson_id uuid, p_admin_id uuid)
returns void language plpgsql security invoker set search_path = '' as $function$
begin
  perform id from public.lesson_drafts
    where id = p_lesson_id and lesson_id = id and created_by = p_admin_id
      and deletion_started_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'lesson not found'; end if;
  update public.lesson_drafts set publication_status = 'unpublished'
    where lesson_id = p_lesson_id and publication_status = 'published';
end;
$function$;
revoke all on function public.unpublish_lesson(uuid, uuid) from public, anon, authenticated;
grant execute on function public.unpublish_lesson(uuid, uuid) to service_role;

create function public.begin_lesson_deletion(p_lesson_id uuid, p_admin_id uuid, p_expected_draft_id uuid, p_confirm_title text)
returns void language plpgsql security invoker set search_path = '' as $function$
declare current_version public.lesson_drafts%rowtype;
begin
  perform id from public.lesson_drafts
    where id = p_lesson_id and lesson_id = id and created_by = p_admin_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'lesson not found'; end if;
  select * into current_version from public.lesson_drafts where lesson_id = p_lesson_id
    order by (publication_status = 'published') desc, (publication_status = 'unpublished') desc, created_at desc, id desc limit 1;
  if p_expected_draft_id is distinct from current_version.id or p_confirm_title is distinct from current_version.title then
    raise exception using errcode = '55000', message = 'lesson changed; confirm deletion again';
  end if;
  update public.lesson_drafts set deletion_started_at = coalesce(deletion_started_at, clock_timestamp()), cleanup_error = null
    where id = p_lesson_id;
  update public.lesson_drafts set publication_status = 'unpublished'
    where lesson_id = p_lesson_id and publication_status = 'published';
end;
$function$;
revoke all on function public.begin_lesson_deletion(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_lesson_deletion(uuid, uuid, uuid, text) to service_role;
