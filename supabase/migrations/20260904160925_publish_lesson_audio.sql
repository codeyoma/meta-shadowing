alter table public.lesson_drafts
  add column audio_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(audio_manifest) = 'array'),
  add column publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published')),
  add column published_at timestamptz,
  add constraint lesson_drafts_publication_is_complete check (
    (
      publication_status = 'draft'
      and published_at is null
    )
    or
    (
      publication_status = 'published'
      and published_at is not null
      and validation_status = 'validated'
      and jsonb_array_length(validation_issues) = 0
      and phrase_count > 0
      and jsonb_array_length(audio_manifest) = phrase_count
    )
  );

create index lesson_drafts_published_catalog_idx
on public.lesson_drafts (language, published_at desc)
where publication_status = 'published';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'lesson-audio',
  'lesson-audio',
  false,
  4194304,
  array['audio/mpeg', 'audio/mp4', 'audio/webm']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Lesson audio administrators can read own objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lesson-audio'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "Lesson audio administrators can upload own objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lesson-audio'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "Lesson audio administrators can replace own objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lesson-audio'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
)
with check (
  bucket_id = 'lesson-audio'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "Lesson audio administrators can delete own objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lesson-audio'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

revoke update on table public.lesson_drafts from authenticated;
grant update (
  title,
  language,
  target_filename,
  korean_filename,
  target_source,
  korean_source,
  parsed_entries,
  validation_issues,
  validation_status,
  phrase_count,
  chapter_count,
  section_count,
  updated_at
) on table public.lesson_drafts to authenticated;

create function public.publish_lesson_draft(
  p_draft_id uuid,
  p_admin_id uuid,
  p_audio_manifest jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  draft_record public.lesson_drafts%rowtype;
  manifest_item jsonb;
  item_index integer;
  phrase_number_text text;
  source_line_text text;
  size_text text;
  canonical_name text;
  file_extension text;
  expected_content_type text;
  expected_path text;
  expected_source_line integer;
  published_time timestamptz;
begin
  select *
  into draft_record
  from public.lesson_drafts
  where id = p_draft_id and created_by = p_admin_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'lesson draft not found';
  end if;

  if draft_record.validation_status <> 'validated'
    or jsonb_array_length(draft_record.validation_issues) <> 0
    or draft_record.phrase_count < 1 then
    raise exception using errcode = '23514', message = 'lesson text validation is incomplete';
  end if;

  if jsonb_typeof(p_audio_manifest) <> 'array'
    or jsonb_array_length(p_audio_manifest) <> draft_record.phrase_count
    or draft_record.phrase_count > 999 then
    raise exception using errcode = '23514', message = 'audio manifest is incomplete';
  end if;

  for manifest_item, item_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_audio_manifest) with ordinality
  loop
    if jsonb_typeof(manifest_item) <> 'object' then
      raise exception using errcode = '23514', message = 'audio manifest item is invalid';
    end if;

    phrase_number_text := manifest_item ->> 'phraseNumber';
    source_line_text := manifest_item ->> 'sourceLine';
    size_text := manifest_item ->> 'size';
    canonical_name := manifest_item ->> 'canonicalName';

    if phrase_number_text is null
      or phrase_number_text !~ '^[0-9]+$'
      or phrase_number_text::integer <> item_index then
      raise exception using errcode = '23514', message = 'audio manifest phrase number is invalid';
    end if;

    if canonical_name is null or canonical_name !~ '^[0-9]{3}\.(mp3|m4a|webm)$' then
      raise exception using errcode = '23514', message = 'audio manifest filename is invalid';
    end if;
    file_extension := split_part(canonical_name, '.', 2);
    if canonical_name <> lpad(item_index::text, 3, '0') || '.' || file_extension then
      raise exception using errcode = '23514', message = 'audio manifest filename is out of sequence';
    end if;

    expected_content_type := case file_extension
      when 'mp3' then 'audio/mpeg'
      when 'm4a' then 'audio/mp4'
      when 'webm' then 'audio/webm'
    end;
    if manifest_item ->> 'contentType' <> expected_content_type then
      raise exception using errcode = '23514', message = 'audio manifest content type is invalid';
    end if;

    if size_text is null or size_text !~ '^[1-9][0-9]*$'
      or size_text::bigint > 4194304 then
      raise exception using errcode = '23514', message = 'audio manifest size is invalid';
    end if;
    if source_line_text is null or source_line_text !~ '^[1-9][0-9]*$' then
      raise exception using errcode = '23514', message = 'audio manifest source line is invalid';
    end if;

    select (entry ->> 'sourceLine')::integer
    into expected_source_line
    from jsonb_array_elements(draft_record.parsed_entries) as entry
    where entry ->> 'kind' = 'phrase'
      and entry ->> 'phraseNumber' = item_index::text
    limit 1;
    if expected_source_line is null or source_line_text::integer <> expected_source_line then
      raise exception using errcode = '23514', message = 'audio manifest source line does not match the lesson';
    end if;

    if nullif(btrim(manifest_item ->> 'originalName'), '') is null then
      raise exception using errcode = '23514', message = 'audio manifest original filename is missing';
    end if;

    expected_path := p_admin_id::text || '/' || p_draft_id::text || '/' || canonical_name;
    if manifest_item ->> 'path' <> expected_path then
      raise exception using errcode = '23514', message = 'audio manifest storage path is invalid';
    end if;

    if not exists (
      select 1
      from storage.objects
      where bucket_id = 'lesson-audio'
        and name = expected_path
        and coalesce(metadata ->> 'mimetype', '') = expected_content_type
        and case
          when coalesce(metadata ->> 'size', '') ~ '^[1-9][0-9]*$'
            then (metadata ->> 'size')::bigint
          else -1
        end = size_text::bigint
    ) then
      raise exception using errcode = '23514', message = 'audio manifest object does not match private storage';
    end if;
  end loop;

  published_time := clock_timestamp();
  update public.lesson_drafts
  set audio_manifest = p_audio_manifest,
      publication_status = 'published',
      published_at = published_time,
      updated_at = published_time
  where id = p_draft_id and created_by = p_admin_id;

  return published_time;
end;
$function$;

revoke all on function public.publish_lesson_draft(uuid, uuid, jsonb) from public;
revoke all on function public.publish_lesson_draft(uuid, uuid, jsonb) from anon;
revoke all on function public.publish_lesson_draft(uuid, uuid, jsonb) from authenticated;
grant execute on function public.publish_lesson_draft(uuid, uuid, jsonb) to service_role;
