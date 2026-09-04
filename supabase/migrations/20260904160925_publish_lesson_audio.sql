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
