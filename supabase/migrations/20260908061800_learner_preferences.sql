-- Account preferences only; progress and session ownership ship separately.
-- No direct learner access: verified server routes own every service-role call.
create table public.learner_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  selection jsonb,
  study_timezone text not null,
  revision bigint not null default 0 check (revision >= 0),
  field_revisions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.learner_preferences enable row level security;
revoke all on public.learner_preferences from public, anon, authenticated, service_role;
grant select, insert, update on public.learner_preferences to service_role;

create function public.get_learner_preferences(p_user_id uuid, p_timezone text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare profile public.learner_preferences;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid-timezone' using errcode = '22023';
  end if;
  insert into public.learner_preferences(user_id, study_timezone)
    values (p_user_id, p_timezone) on conflict (user_id) do nothing;
  select * into strict profile from public.learner_preferences where user_id = p_user_id;
  return jsonb_build_object('accountId', profile.user_id, 'overrides', profile.settings,
    'selection', profile.selection, 'studyTimeZone', profile.study_timezone, 'revision', profile.revision);
end;
$$;
revoke all on function public.get_learner_preferences(uuid, text) from public, anon, authenticated;
grant execute on function public.get_learner_preferences(uuid, text) to service_role;

create function public.patch_learner_preferences(p_user_id uuid, p_revision bigint, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  profile public.learner_preferences;
  field text;
  value jsonb;
  previous jsonb;
  changed boolean := false;
begin
  if p_revision is null or p_revision < 0 or jsonb_typeof(p_changes) is distinct from 'object' or p_changes = '{}'::jsonb then
    raise exception 'invalid-patch' using errcode = '22023';
  end if;
  select * into strict profile from public.learner_preferences where user_id = p_user_id for update;
  if p_revision > profile.revision then
    raise exception 'invalid-revision' using errcode = '22023';
  end if;
  for field, value in select * from jsonb_each(p_changes) loop
    if not (field = any(array['mode','display','speed','groupSize','wpmLevel','advanceDelayMs','groupGapMs','speakingExtraMs','lineGapMs','sectionGapMs','selection'])) then
      raise exception 'invalid-field' using errcode = '22023';
    end if;
    previous := case when field = 'selection' then profile.selection else profile.settings->field end;
    if (profile.field_revisions->>field)::bigint > p_revision and previous is distinct from value then
      return jsonb_build_object('accountId', profile.user_id, 'overrides', profile.settings,
        'selection', profile.selection, 'studyTimeZone', profile.study_timezone, 'revision', profile.revision, 'conflict', true);
    end if;
    changed := changed or previous is distinct from value;
  end loop;
  if changed then
    for field, value in select * from jsonb_each(p_changes) loop
      previous := case when field = 'selection' then profile.selection else profile.settings->field end;
      if previous is distinct from value then
        profile.field_revisions := profile.field_revisions || jsonb_build_object(field, profile.revision + 1);
        if field = 'selection' then profile.selection := value;
        else profile.settings := profile.settings || jsonb_build_object(field, value);
        end if;
      end if;
    end loop;
    update public.learner_preferences set settings = profile.settings, selection = profile.selection,
      revision = profile.revision + 1, field_revisions = profile.field_revisions, updated_at = now()
      where user_id = p_user_id returning * into profile;
  end if;
  return jsonb_build_object('accountId', profile.user_id, 'overrides', profile.settings,
    'selection', profile.selection, 'studyTimeZone', profile.study_timezone, 'revision', profile.revision, 'conflict', false);
end;
$$;
revoke all on function public.patch_learner_preferences(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.patch_learner_preferences(uuid, bigint, jsonb) to service_role;
