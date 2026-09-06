create table public.session_defaults (
  id boolean primary key default true check (id),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.session_defaults enable row level security;
revoke all on table public.session_defaults from public, anon, authenticated;
grant select on table public.session_defaults to authenticated, service_role;
grant update (settings, updated_at) on table public.session_defaults to authenticated;
grant all on table public.session_defaults to service_role;

create policy "Administrators read global defaults"
on public.session_defaults for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "Administrators update global defaults"
on public.session_defaults for update to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

-- Empty overrides inherit the versioned application's approved defaults.
insert into public.session_defaults (id) values (true);
