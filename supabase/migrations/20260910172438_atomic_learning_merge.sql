-- Learning is append/merge-only at the authenticated write boundary. Existing
-- rows are preserved; validation happens on their next merge, under the row lock.
alter table public.learner_snapshots add column options_revision bigint not null default 0
  check (options_revision between 0 and 9007199254740991);
revoke insert, update on public.learner_snapshots from authenticated;
drop policy "Learners insert their own snapshot" on public.learner_snapshots;
drop policy "Learners update their own snapshot" on public.learner_snapshots;

create function private.learning_exact_keys(value jsonb, keys text[]) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(value) = 'object' and value ?& keys
    and (select count(*) from jsonb_object_keys(value)) = cardinality(keys);
$$;

create function private.learning_counter(value jsonb, maximum numeric default 9007199254740991) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(value) = 'number' then
    (value::text)::numeric between 0 and maximum and trunc((value::text)::numeric) = (value::text)::numeric
    else false end;
$$;

create function private.learning_day(value text) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare y integer; m integer; d integer; max_day integer;
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  y := substring(value,1,4)::integer; m := substring(value,6,2)::integer; d := substring(value,9,2)::integer;
  if m < 1 or m > 12 then return false; end if;
  max_day := (array[31,28,31,30,31,30,31,31,30,31,30,31])[m];
  if m = 2 and y % 4 = 0 and (y % 100 <> 0 or y % 400 = 0) then max_day := 29; end if;
  return d between 1 and max_day;
end;
$$;

create function private.learning_timestamp(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare v text; parts text[];
begin
  if jsonb_typeof(value) is distinct from 'string' then return false; end if;
  v := value #>> '{}';
  parts := regexp_match(v, '^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,3})?(Z|[+-]([0-9]{2}):([0-9]{2}))$');
  return parts is not null and private.learning_day(parts[1]) and parts[2]::integer <= 23
    and parts[3]::integer <= 59 and parts[4]::integer <= 59
    and (parts[6] = 'Z' or (parts[7]::integer <= 23 and parts[8]::integer <= 59));
end;
$$;

create function private.learning_normalized_timestamp(value text) returns text
language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare y integer; parts text[]; instant timestamptz; normalized_year integer;
begin
  parts := regexp_match(value, '^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,3})?(Z|([+-])([0-9]{2}):([0-9]{2}))$');
  y := parts[1]::integer;
  instant := make_timestamptz(case when y = 0 then -1 else y end, parts[2]::integer, parts[3]::integer,
    parts[4]::integer, parts[5]::integer, (parts[6] || coalesce(parts[7], ''))::double precision, 'UTC');
  if parts[8] <> 'Z' then
    instant := instant - (case when parts[9] = '+' then 1 else -1 end)
      * make_interval(mins => parts[10]::integer * 60 + parts[11]::integer);
  end if;
  normalized_year := extract(year from instant)::integer;
  if normalized_year < 0 then normalized_year := normalized_year + 1; end if;
  if normalized_year < 0 or normalized_year > 9999 then raise exception using errcode = 'P1001', message = 'invalid-merge'; end if;
  return lpad(normalized_year::text,4,'0') || to_char(instant, '-MM-DD"T"HH24:MI:SS.MS"Z"');
end;
$$;

create function private.learning_settings(value jsonb, complete boolean) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare member record; n numeric;
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if complete and (select count(*) from jsonb_object_keys(value)) <> 10 then return false; end if;
  for member in select * from jsonb_each(value) loop
    if member.key = 'mode' then
      if member.value not in ('"manual"','"automatic"') then return false; end if;
    elsif member.key = 'display' then
      if member.value not in ('"current"','"cumulative"') then return false; end if;
    else
      if jsonb_typeof(member.value) <> 'number' then return false; end if;
      n := member.value::text::numeric;
      if member.key = 'speed' then
        if n not in (0.5,0.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75,3) then return false; end if;
      elsif member.key = 'groupSize' then
        if n not in (2,3,4) then return false; end if;
      elsif member.key = 'wpmLevel' then
        if n not in (3,4,5,6) then return false; end if;
      elsif member.key in ('advanceDelayMs','groupGapMs','speakingExtraMs','lineGapMs','sectionGapMs') then
        if n < 0 or n > 30000 then return false; end if;
      else return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

create function private.learning_valid_run(value jsonb, completed boolean) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare keys text[] := array['runId','lessonId','lessonVersion','lessonName','language','level','stage','nextUnit','nextPhrase','activeMs','settings','confirmedCycles']; key text; level integer;
begin
  if completed then keys := keys || array['completedAt']; end if;
  if not coalesce(private.learning_exact_keys(value,keys),false) then return false; end if;
  foreach key in array array['runId','lessonId'] loop
    if jsonb_typeof(value->key) <> 'string' or length(value->>key) not between 1 and 128 then return false; end if;
  end loop;
  if not private.learning_timestamp(value->'lessonVersion') or jsonb_typeof(value->'lessonName') <> 'string'
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

create function private.learning_validate_snapshot(value jsonb, owner_id uuid) returns void
language plpgsql stable security invoker set search_path = '' as $$
declare item jsonb; all_runs jsonb;
begin
  if private.account_snapshot_json_bytes(value) > 2097152 then raise exception using errcode='P1005',message='merge-limit'; end if;
  if not coalesce(private.learning_exact_keys(value,array['schemaVersion','accountId','preferredLevel','settings','runs','history','studyDays']),false)
    or value->'schemaVersion' is distinct from '1'::jsonb or value->'accountId' is distinct from to_jsonb(owner_id::text)
    or not private.learning_counter(value->'preferredLevel',8) or value->'preferredLevel' = '0'
    or not private.learning_settings(value->'settings',false)
    or jsonb_typeof(value->'runs') is distinct from 'array' or jsonb_typeof(value->'history') is distinct from 'array'
    or jsonb_typeof(value->'studyDays') is distinct from 'array' then raise exception using errcode='P1001',message='invalid-merge'; end if;
  if jsonb_array_length(value->'runs') > 2000 or jsonb_array_length(value->'history') > 10000 or jsonb_array_length(value->'studyDays') > 36600 then
    raise exception using errcode='P1005',message='merge-limit'; end if;
  for item in select * from jsonb_array_elements(value->'runs') loop
    if not private.learning_valid_run(item,false) then raise exception using errcode='P1001',message='invalid-merge'; end if;
  end loop;
  for item in select * from jsonb_array_elements(value->'history') loop
    if not private.learning_valid_run(item,true) then raise exception using errcode='P1001',message='invalid-merge'; end if;
  end loop;
  all_runs := (value->'runs') || (value->'history');
  if (select count(*) <> count(distinct run->>'runId') from jsonb_array_elements(all_runs) run) then
    raise exception using errcode='P1001',message='invalid-merge'; end if;
  for item in select * from jsonb_array_elements(value->'studyDays') loop
    if jsonb_typeof(item) <> 'string' or not private.learning_day(item #>> '{}') then raise exception using errcode='P1001',message='invalid-merge'; end if;
  end loop;
  if (select count(*) <> count(distinct day) from jsonb_array_elements(value->'studyDays') day) then
    raise exception using errcode='P1001',message='invalid-merge'; end if;
end;
$$;

-- Sorted JSON keys plus C collation form the shared TypeScript/SQL tie-break.
-- Numeric JSON representations (1 vs 1.0; small exponent spelling) normalize.
create function private.learning_canonical(value jsonb) returns text
language plpgsql stable strict security invoker set search_path = '' as $$
declare n double precision;
begin
  if jsonb_typeof(value) = 'object' then
    return '{' || coalesce((select string_agg(to_jsonb(e.key)::text || ':' || private.learning_canonical(e.value),',' order by e.key collate "C") from jsonb_each(value) e),'') || '}';
  elsif jsonb_typeof(value) = 'number' then
    n := value::text::double precision;
    if n = 0 then return '0'; end if;
    if abs(n) >= 0.000001 then return trim_scale(n::text::numeric)::text; end if;
    return regexp_replace(n::text, 'e(-?)0+([0-9]+)$', 'e\1\2');
  else return value::text;
  end if;
end;
$$;

create function private.merge_learning_snapshot_impl(batch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; incoming jsonb; saved jsonb; merged jsonb; revision bigint;
  empty_snapshot jsonb; all_runs jsonb; runs jsonb; history jsonb; days jsonb; keys text[];
begin
  owner_id := auth.uid();
  if owner_id is null or coalesce(auth.jwt()->>'role','') <> 'authenticated'
    or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception using errcode='42501',message='unauthorized'; end if;
  if jsonb_typeof(batch) is distinct from 'object' then raise exception using errcode='P1001',message='invalid-merge'; end if;
  if batch->'protocolVersion' is distinct from '1'::jsonb then raise exception using errcode='P1002',message='client-update-required'; end if;
  if jsonb_typeof(batch->'accountId') = 'string' and batch->>'accountId' <> owner_id::text then raise exception using errcode='P1004',message='account-changed'; end if;
  keys := array['protocolVersion','accountId','runs','history','studyDays'];
  if batch ? 'options' then keys := keys || array['options']; end if;
  if not private.learning_exact_keys(batch,keys) then raise exception using errcode='P1001',message='invalid-merge'; end if;
  if private.account_snapshot_json_bytes(batch) > 2097152 then raise exception using errcode='P1005',message='merge-limit'; end if;
  if batch ? 'options' and (not coalesce(private.learning_exact_keys(batch->'options',array['expectedRevision','preferredLevel','settings']),false)
    or not private.learning_counter(batch#>'{options,expectedRevision}')) then raise exception using errcode='P1001',message='invalid-merge'; end if;
  empty_snapshot := jsonb_build_object('schemaVersion',1,'accountId',owner_id::text,'preferredLevel',1,'settings','{}'::jsonb,'runs','[]'::jsonb,'history','[]'::jsonb,'studyDays','[]'::jsonb);
  incoming := jsonb_build_object('schemaVersion',1,'accountId',batch->'accountId','preferredLevel',case when batch ? 'options' then batch#>'{options,preferredLevel}' else '1'::jsonb end,
    'settings',case when batch ? 'options' then batch#>'{options,settings}' else '{}'::jsonb end,'runs',batch->'runs','history',batch->'history','studyDays',batch->'studyDays');
  perform private.learning_validate_snapshot(incoming,owner_id);

  -- INSERT's unique-index conflict wait serializes concurrent first uploads;
  -- SELECT FOR UPDATE then covers both newly established and existing rows.
  insert into public.learner_snapshots(account_id,schema_version,snapshot) values(owner_id,1,empty_snapshot)
    on conflict(account_id) do nothing;
  select snapshot,options_revision into saved,revision from public.learner_snapshots where account_id=owner_id for update;
  perform private.learning_validate_snapshot(saved,owner_id);
  if batch ? 'options' and (batch#>>'{options,expectedRevision}')::numeric <> revision then raise exception using errcode='P1003',message='options-conflict'; end if;
  all_runs := (saved->'runs') || (saved->'history') || (incoming->'runs') || (incoming->'history');
  if exists(select 1 from jsonb_array_elements(all_runs) r group by r->>'runId'
    having count(distinct jsonb_build_array(r->'lessonId',r->'lessonVersion',r->'language',r->'level',r->'stage')) > 1) then
    raise exception using errcode='P1001',message='invalid-merge'; end if;

  with normalized as (
    select case when r ? 'completedAt' then jsonb_set(r,'{completedAt}',to_jsonb(private.learning_normalized_timestamp(r->>'completedAt'))) else r end r
    from jsonb_array_elements(all_runs) r
  ), ranked as (
    select r, max((r->>'activeMs')::numeric) over(partition by r->>'runId') active_ms,
      row_number() over(partition by r->>'runId' order by
        (r ? 'completedAt') desc,
        case when r ? 'completedAt' then r->>'completedAt' end collate "C" asc,
        case when r ? 'completedAt' then private.learning_canonical(r - 'activeMs') end collate "C" asc,
        (r->>'nextPhrase')::numeric desc,
        private.learning_canonical(r->'settings') collate "C" desc,
        (r->>'confirmedCycles')::numeric desc, (r->>'nextUnit')::numeric desc,
        private.learning_canonical(r - 'activeMs') collate "C" desc) position
    from normalized
  ), winners as (select jsonb_set(r,'{activeMs}',to_jsonb(active_ms)) r from ranked where position=1)
  select coalesce(jsonb_agg(r order by r->>'runId' collate "C") filter(where not r ? 'completedAt'),'[]'::jsonb),
    coalesce(jsonb_agg(r order by r->>'runId' collate "C") filter(where r ? 'completedAt'),'[]'::jsonb) into runs,history from winners;
  select coalesce(jsonb_agg(day order by day collate "C"),'[]'::jsonb) into days from (
    select distinct d #>> '{}' as day from jsonb_array_elements((saved->'studyDays') || (incoming->'studyDays')) d
  ) combined_days;
  merged := saved || jsonb_build_object('runs',runs,'history',history,'studyDays',days);
  if batch ? 'options' then
    if revision = 9007199254740991 then raise exception using errcode='P1005',message='merge-limit'; end if;
    merged := merged || jsonb_build_object('preferredLevel',incoming->'preferredLevel','settings',incoming->'settings');
    revision := revision + 1;
  end if;
  perform private.learning_validate_snapshot(merged,owner_id);
  update public.learner_snapshots set snapshot=merged,options_revision=revision where account_id=owner_id;
  return jsonb_build_object('optionsRevision',revision);
end;
$$;

-- Only the small authenticated entry point is exposed through PostgREST. The
-- definer and its validators have no PUBLIC/anon execute privileges.
create function public.merge_learning_snapshot(batch jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.merge_learning_snapshot_impl(batch);
$$;
revoke all on function private.learning_exact_keys(jsonb,text[]), private.learning_counter(jsonb,numeric),
  private.learning_day(text), private.learning_timestamp(jsonb), private.learning_normalized_timestamp(text),
  private.learning_settings(jsonb,boolean), private.learning_valid_run(jsonb,boolean),
  private.learning_validate_snapshot(jsonb,uuid), private.learning_canonical(jsonb),
  private.merge_learning_snapshot_impl(jsonb), public.merge_learning_snapshot(jsonb) from public,anon,authenticated;
grant execute on function private.merge_learning_snapshot_impl(jsonb), public.merge_learning_snapshot(jsonb) to authenticated;
