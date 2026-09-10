create function private.account_snapshot_compact_json(input jsonb)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(input)
    when 'object' then '{' || coalesce((
      select pg_catalog.string_agg(
        pg_catalog.to_jsonb(member.key)::text || ':' || private.account_snapshot_compact_json(member.value),
        ',' order by member.key
      )
      from pg_catalog.jsonb_each(input) member
    ), '') || '}'
    when 'array' then '[' || coalesce((
      select pg_catalog.string_agg(
        private.account_snapshot_compact_json(member.value),
        ',' order by member.ordinal
      )
      from pg_catalog.jsonb_array_elements(input) with ordinality member(value, ordinal)
    ), '') || ']'
    else input::text
  end;
$$;
revoke all on function private.account_snapshot_compact_json(jsonb) from public, anon, authenticated;
grant execute on function private.account_snapshot_compact_json(jsonb) to authenticated, service_role;

create function private.account_snapshot_json_bytes(input jsonb)
returns bigint
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.octet_length(private.account_snapshot_compact_json(input))::bigint;
$$;
revoke all on function private.account_snapshot_json_bytes(jsonb) from public, anon, authenticated;
grant execute on function private.account_snapshot_json_bytes(jsonb) to authenticated, service_role;

create table public.learner_snapshots (
  account_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  constraint learner_snapshots_supported_version check (schema_version = 1),
  constraint learner_snapshots_object check (jsonb_typeof(snapshot) = 'object'),
  constraint learner_snapshots_version_matches check (
    snapshot->'schemaVersion' = to_jsonb(schema_version)
  ),
  constraint learner_snapshots_identity_matches check (
    snapshot->>'accountId' = account_id::text
  ),
  constraint learner_snapshots_basic_shape check (
    snapshot ?& array['schemaVersion', 'accountId', 'preferredLevel', 'settings', 'runs', 'history', 'studyDays']
    and jsonb_typeof(snapshot->'preferredLevel') = 'number'
    and jsonb_typeof(snapshot->'settings') = 'object'
    and jsonb_typeof(snapshot->'runs') = 'array'
    and jsonb_typeof(snapshot->'history') = 'array'
    and jsonb_typeof(snapshot->'studyDays') = 'array'
  ),
  constraint learner_snapshots_byte_limit check (private.account_snapshot_json_bytes(snapshot) <= 2097152)
);

alter table public.learner_snapshots enable row level security;
revoke all on table public.learner_snapshots from public, anon, authenticated;
grant select, insert, update on table public.learner_snapshots to authenticated;

create policy "Learners read their own snapshot"
on public.learner_snapshots for select
to authenticated
using (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (select auth.uid()) = account_id
);

create policy "Learners insert their own snapshot"
on public.learner_snapshots for insert
to authenticated
with check (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (select auth.uid()) = account_id
  and snapshot->>'accountId' = (select auth.uid())::text
);

create policy "Learners update their own snapshot"
on public.learner_snapshots for update
to authenticated
using (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (select auth.uid()) = account_id
)
with check (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (select auth.uid()) = account_id
  and snapshot->>'accountId' = (select auth.uid())::text
);

create function public.set_learner_snapshot_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke all on function public.set_learner_snapshot_updated_at() from public, anon, authenticated;

create trigger learner_snapshots_set_updated_at
before insert or update on public.learner_snapshots
for each row execute function public.set_learner_snapshot_updated_at();
