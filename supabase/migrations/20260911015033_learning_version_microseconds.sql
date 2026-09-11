-- Published lesson versions are PostgreSQL timestamps with up to six fractional
-- digits. Preserve that exact identity; client completion times remain limited
-- to milliseconds for the existing normalization and deterministic merge rules.
create function private.learning_timestamp(value jsonb, max_fraction_digits integer) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare v text; parts text[];
begin
  if max_fraction_digits is null or max_fraction_digits not in (3,6)
    or jsonb_typeof(value) is distinct from 'string' then return false; end if;
  v := value #>> '{}';
  parts := regexp_match(v, '^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,6})?(Z|[+-]([0-9]{2}):([0-9]{2}))$');
  return parts is not null and private.learning_day(parts[1]) and parts[2]::integer <= 23
    and parts[3]::integer <= 59 and parts[4]::integer <= 59
    and coalesce(length(parts[5]) - 1, 0) <= max_fraction_digits
    and (parts[6] = 'Z' or (parts[7]::integer <= 23 and parts[8]::integer <= 59));
end;
$$;

create or replace function private.learning_timestamp(value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select private.learning_timestamp(value,3);
$$;

create or replace function private.learning_valid_run(value jsonb, completed boolean) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare keys text[] := array['runId','lessonId','lessonVersion','lessonName','language','level','stage','nextUnit','nextPhrase','activeMs','settings','confirmedCycles']; key text; level integer;
begin
  if completed then keys := keys || array['completedAt']; end if;
  if not coalesce(private.learning_exact_keys(value,keys),false) then return false; end if;
  foreach key in array array['runId','lessonId'] loop
    if jsonb_typeof(value->key) <> 'string' or length(value->>key) not between 1 and 128 then return false; end if;
  end loop;
  if not private.learning_timestamp(value->'lessonVersion',6) or jsonb_typeof(value->'lessonName') <> 'string'
    or value->'language' not in ('"english"','"japanese"','"chinese"','"german"','"french"')
    or not private.learning_counter(value->'level',8) or value->'level' = '0' then return false; end if;
  level := (value->>'level')::numeric::integer;
  if not private.learning_counter(value->'stage',16) or (value->>'stage')::numeric not in (level*2-1,level*2) then return false; end if;
  foreach key in array array['nextUnit','nextPhrase','activeMs','confirmedCycles'] loop
    if not private.learning_counter(value->key) then return false; end if;
  end loop;
  if (value->>'confirmedCycles')::numeric > 5 or (level >= 6 and value->'confirmedCycles' <> '0') then return false; end if;
  return private.learning_settings(value->'settings',true) and (not completed or private.learning_timestamp(value->'completedAt'));
exception when others then return false;
end;
$$;

revoke all on function private.learning_timestamp(jsonb,integer) from public,anon,authenticated;
