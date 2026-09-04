create table public.lesson_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  language text not null check (language in ('english', 'japanese')),
  target_filename text not null check (length(btrim(target_filename)) > 0),
  korean_filename text not null check (length(btrim(korean_filename)) > 0),
  target_source text not null,
  korean_source text not null,
  parsed_entries jsonb not null check (jsonb_typeof(parsed_entries) = 'array'),
  validation_issues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_issues) = 'array'),
  validation_status text not null check (validation_status in ('invalid', 'validated')),
  phrase_count integer not null check (phrase_count >= 0),
  chapter_count integer not null check (chapter_count >= 0),
  section_count integer not null check (section_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_drafts_validation_status_matches_issues check (
    (validation_status = 'validated' and jsonb_array_length(validation_issues) = 0 and phrase_count > 0)
    or
    (validation_status = 'invalid' and (jsonb_array_length(validation_issues) > 0 or phrase_count = 0))
  )
);

create index lesson_drafts_created_by_idx on public.lesson_drafts (created_by);
create index lesson_drafts_created_at_idx on public.lesson_drafts (created_at desc);

alter table public.lesson_drafts enable row level security;

revoke all on table public.lesson_drafts from anon;
grant select, insert, update, delete on table public.lesson_drafts to authenticated;

create policy "Administrators can read their lesson drafts"
on public.lesson_drafts
for select
to authenticated
using (
  (select auth.uid()) = created_by
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "Administrators can create their lesson drafts"
on public.lesson_drafts
for insert
to authenticated
with check (
  (select auth.uid()) = created_by
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "Administrators can update their lesson drafts"
on public.lesson_drafts
for update
to authenticated
using (
  (select auth.uid()) = created_by
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
)
with check (
  (select auth.uid()) = created_by
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "Administrators can delete their lesson drafts"
on public.lesson_drafts
for delete
to authenticated
using (
  (select auth.uid()) = created_by
  and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);
