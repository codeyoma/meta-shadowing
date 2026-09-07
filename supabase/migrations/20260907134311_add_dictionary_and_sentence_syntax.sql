-- Open dictionary text and paid-provider results are served through authenticated
-- application routes. Neither table is exposed to browser database clients.
create table public.dictionary_entries (
  id text primary key,
  language text not null check (language in ('en', 'ja', 'zh', 'es', 'de', 'fr')),
  headword text not null,
  lookup_keys text[] not null check (cardinality(lookup_keys) > 0),
  entry jsonb not null check (jsonb_typeof(entry) = 'object'),
  source_dump text not null,
  updated_at timestamptz not null default now()
);
create index dictionary_entries_language_idx on public.dictionary_entries (language);
create index dictionary_entries_lookup_idx on public.dictionary_entries using gin (lookup_keys);
alter table public.dictionary_entries enable row level security;
revoke all on public.dictionary_entries from public, anon, authenticated;
grant all on public.dictionary_entries to service_role;

create table public.lesson_sentence_syntax (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.lesson_drafts(id) on delete cascade,
  phrase_number integer not null check (phrase_number > 0),
  sentence_number integer not null check (sentence_number > 0),
  begin_offset integer not null check (begin_offset >= 0),
  text_content text not null check (length(text_content) > 0),
  language_code text not null check (language_code in ('en', 'ja', 'zh', 'es', 'de', 'fr')),
  text_hash text not null,
  analyzer_version text not null default 'google-v1-utf16',
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_id uuid,
  claimed_at timestamptz,
  completed_at timestamptz,
  response jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  unique (draft_id, phrase_number, sentence_number),
  check (status <> 'complete' or (response is not null and jsonb_typeof(response) = 'object'))
);
create index lesson_sentence_syntax_pending_idx on public.lesson_sentence_syntax (draft_id, status, phrase_number, sentence_number);
create index lesson_sentence_syntax_cache_idx on public.lesson_sentence_syntax (language_code, text_hash, analyzer_version) where status = 'complete';
alter table public.lesson_sentence_syntax enable row level security;
revoke all on public.lesson_sentence_syntax from public, anon, authenticated;
grant all on public.lesson_sentence_syntax to service_role;

-- Atomic claims prevent simultaneous administrator tabs from billing the same
-- pending row. Expired leases recover work interrupted by navigation or a crash.
create function public.claim_sentence_syntax(p_draft_id uuid, p_limit integer default 6)
returns setof public.lesson_sentence_syntax
language sql
set search_path = ''
as $$
  with candidates as (
    select id from public.lesson_sentence_syntax
    where draft_id = p_draft_id and (
      status = 'pending' or (status = 'processing' and claimed_at < now() - interval '3 minutes')
    )
    order by phrase_number, sentence_number
    limit greatest(1, least(p_limit, 6))
    for update skip locked
  )
  update public.lesson_sentence_syntax s
  set status = 'processing', lease_id = gen_random_uuid(), claimed_at = now(),
      attempts = attempts + 1, error_code = null
  from candidates c where s.id = c.id
  returning s.*;
$$;
revoke all on function public.claim_sentence_syntax(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_sentence_syntax(uuid, integer) to service_role;
