-- Keep legacy manifests valid. Verified copies are nested below an owned draft;
-- authenticated Storage policies prohibit writes there, even before publication.
-- CREATE OR REPLACE preserves the existing service-only EXECUTE grants.
create or replace function private.publish_lesson_draft(
  p_draft_id uuid,
  p_admin_id uuid,
  p_audio_manifest jsonb
)
returns timestamptz
language plpgsql
security invoker
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

    if manifest_item ? 'sha256' then
      if jsonb_typeof(manifest_item -> 'sha256') <> 'string'
        or (manifest_item ->> 'sha256') !~ '^[a-f0-9]{64}$' then
        raise exception using errcode = '23514', message = 'audio manifest digest is invalid';
      end if;
      expected_path := p_admin_id::text || '/' || p_draft_id::text || '/verified/'
        || (manifest_item ->> 'sha256') || '.' || file_extension;
    else
      expected_path := p_admin_id::text || '/' || p_draft_id::text || '/' || canonical_name;
    end if;
    if manifest_item ->> 'path' is distinct from expected_path then
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

-- Service-role Storage uploads bypass RLS. Hold the same root lock as lesson
-- deletion until their object-metadata transaction commits. Cleanup can then see
-- every preceding insert, and a late insert cannot outlive the deletion marker.
create or replace function private.guard_verified_lesson_audio() returns trigger
language plpgsql security invoker set search_path = '' as $function$
declare
  verified_new boolean := new.bucket_id = 'lesson-audio'
    and coalesce((storage.foldername(new.name))[3] = 'verified', false);
  verified_old boolean := false;
begin
  if tg_op = 'UPDATE' then
    verified_old := old.bucket_id = 'lesson-audio'
      and coalesce((storage.foldername(old.name))[3] = 'verified', false);
    if (verified_old or verified_new)
      and (new.name is distinct from old.name or new.bucket_id is distinct from old.bucket_id) then
      raise exception using errcode = '55000', message = 'verified audio paths are immutable';
    end if;
  end if;
  if not verified_new then return new; end if;
  if array_length(storage.foldername(new.name), 1) <> 3
    or storage.filename(new.name) !~ '^[a-f0-9]{64}\.(mp3|m4a|webm)$' then
    raise exception using errcode = '23514', message = 'verified audio path is invalid';
  end if;
  perform root.id from public.lesson_drafts draft
    join public.lesson_drafts root on root.id = draft.lesson_id
    where draft.id::text = (storage.foldername(new.name))[2]
      and draft.created_by::text = (storage.foldername(new.name))[1]
      and root.created_by = draft.created_by and root.deletion_started_at is null
    for share of root;
  if not found then
    raise exception using errcode = '55000', message = 'verified audio lesson is missing or being deleted';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_verified_lesson_audio() from public, anon, authenticated;
-- No new Storage policies or grants: the trigger also constrains service writes.
-- DELETE stays available to the existing explicit lesson-cleanup operation.
create trigger guard_verified_lesson_audio before insert or update on storage.objects
  for each row execute function private.guard_verified_lesson_audio();
