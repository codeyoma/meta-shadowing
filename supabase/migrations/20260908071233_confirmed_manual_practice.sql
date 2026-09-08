-- Server-confirmed manual practice. Deliberately no direct learner Data API access.
create table public.learner_practice_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 instance uuid, generation bigint not null default 0, lease_until timestamptz,
 run_id uuid, revision bigint not null default 0
);
create table public.learner_practice_runs (
 user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null, record jsonb not null, status text not null check(status in ('active','abandoned','completed')),
 primary key(user_id,run_id)
);
create table public.learner_practice_operations (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation uuid not null, request jsonb not null, result jsonb not null,
 primary key(user_id,operation)
);
create table public.learner_study_days (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null, primary key(user_id,day)
);
alter table public.learner_practice_accounts enable row level security;
alter table public.learner_practice_runs enable row level security;
alter table public.learner_practice_operations enable row level security;
alter table public.learner_study_days enable row level security;
revoke all on public.learner_practice_accounts,public.learner_practice_runs,public.learner_practice_operations,public.learner_study_days from public,anon,authenticated,service_role;
grant select,insert,update on public.learner_practice_accounts,public.learner_practice_runs to service_role;
grant select,insert on public.learner_practice_operations,public.learner_study_days to service_role;

create or replace function public.learner_practice(p_user_id uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a public.learner_practice_accounts; r public.learner_practice_runs; lesson public.lesson_drafts;
 instance_id uuid := (p_command->>'instance')::uuid;
 operation_id uuid := (p_command->>'operation')::uuid;
 result jsonb; saved public.learner_practice_operations;
 action text := p_command->>'action';
 next_unit integer; active_ms bigint; kind text; timezone text;
 snapshot_settings jsonb := p_command->'settings';
begin
 if instance_id is null or action is null or action not in ('start','checkpoint','renew','release') then raise exception 'invalid-command'; end if;
 insert into public.learner_practice_accounts(user_id) values(p_user_id) on conflict do nothing;
 select * into strict a from public.learner_practice_accounts where user_id=p_user_id for update;
 if action <> 'start' then
   if a.instance is distinct from instance_id or a.generation is distinct from (p_command->>'generation')::bigint
     or a.run_id is distinct from (p_command->>'runId')::uuid or a.lease_until is null or a.lease_until <= clock_timestamp() then raise exception 'ownership-lost'; end if;
   if action = 'release' then
     update public.learner_practice_accounts set lease_until=null,instance=null where user_id=p_user_id;
     return jsonb_build_object('accountId',p_user_id,'released',true);
   end if;
   select * into strict r from public.learner_practice_runs where user_id=p_user_id and run_id=a.run_id;
   select * into lesson from public.lesson_drafts where lesson_id=(r.record->>'lessonId')::uuid and publication_status='published' for share;
   if not found or lesson.published_at is distinct from (r.record->>'lessonVersion')::timestamptz then raise exception 'lesson-version-changed'; end if;
   if action = 'checkpoint' then
     if operation_id is null then raise exception 'invalid-command'; end if;
     select * into saved from public.learner_practice_operations where user_id=p_user_id and operation=operation_id;
     if found then
       if saved.request is distinct from p_command then raise exception 'operation-conflict'; end if;
       return saved.result;
     end if;
     if r.status <> 'active' then raise exception 'run-completed'; end if;
     if a.revision is distinct from (p_command->>'revision')::bigint then raise exception 'revision-conflict'; end if;
     next_unit := (p_command->>'nextUnit')::integer; active_ms := (p_command->>'activeMs')::bigint; kind := p_command->>'kind';
     if next_unit is null or next_unit < 0 or next_unit > lesson.phrase_count or active_ms is null
       or active_ms < (r.record->>'activeMs')::bigint or active_ms > 9007199254740991
       or kind is null or kind not in ('studied','advance','jump') then raise exception 'invalid-checkpoint'; end if;
     if kind='studied' and next_unit <> (r.record->>'nextUnit')::integer then raise exception 'invalid-checkpoint'; end if;
     if kind='advance' and (next_unit <> (r.record->>'nextUnit')::integer+1 or coalesce((p_command->>'confirmedCycles')::int,0) < 3) then raise exception 'invalid-checkpoint'; end if;
     if kind <> 'advance' and next_unit=lesson.phrase_count then raise exception 'invalid-checkpoint'; end if;
     r.record := r.record || jsonb_build_object('nextUnit',next_unit,'nextPhrase',next_unit,'activeMs',active_ms);
     if kind='studied' then
       select study_timezone into strict timezone from public.learner_preferences where user_id=p_user_id;
       insert into public.learner_study_days values(p_user_id,(clock_timestamp() at time zone timezone)::date) on conflict do nothing;
     end if;
     if next_unit=lesson.phrase_count then
       r.status := 'completed'; r.record := r.record || jsonb_build_object('completedAt',clock_timestamp());
     end if;
     update public.learner_practice_runs set record=r.record,status=r.status where user_id=p_user_id and run_id=a.run_id;
     a.revision := a.revision+1;
   end if;
   update public.learner_practice_accounts set revision=a.revision,lease_until=clock_timestamp()+interval '30 seconds' where user_id=p_user_id returning * into a;
   result := jsonb_build_object('accountId',p_user_id,'record',r.record,'revision',a.revision,'generation',a.generation,'leaseUntil',a.lease_until);
   if action='checkpoint' then insert into public.learner_practice_operations values(p_user_id,operation_id,p_command,result); end if;
   return result;
 end if;
 -- Settings are server-resolved context, not caller intent. A retry after a
 -- preference change must return the originally acquired run, not a new snapshot.
 p_command := p_command - 'settings';
 if a.lease_until > clock_timestamp() and a.instance is distinct from instance_id then raise exception 'session-busy'; end if;
 select * into lesson from public.lesson_drafts where lesson_id=(p_command->>'lessonId')::uuid and publication_status='published' for share;
 if not found or lesson.published_at is distinct from (p_command->>'lessonVersion')::timestamptz then raise exception 'lesson-version-changed'; end if;
 if coalesce((p_command->>'level')::int,0) not between 1 and 3 or coalesce((p_command->>'stage')::int,0) not between ((p_command->>'level')::int * 2 - 1) and ((p_command->>'level')::int * 2)
   then raise exception 'mode-unavailable'; end if;
 if operation_id is null then raise exception 'invalid-command'; end if;
 select * into saved from public.learner_practice_operations where user_id=p_user_id and operation=operation_id;
 if found then
   if saved.request is distinct from p_command then raise exception 'operation-conflict'; end if;
   if a.instance is distinct from instance_id or a.lease_until <= clock_timestamp() or a.generation <> (saved.result->>'generation')::bigint then raise exception 'ownership-lost'; end if;
   return saved.result;
 end if;
 select * into r from public.learner_practice_runs where user_id=p_user_id and run_id=a.run_id;
 if not found or r.status <> 'active' or r.record->>'lessonId' <> p_command->>'lessonId'
   or (r.record->>'lessonVersion')::timestamptz <> lesson.published_at or r.record->>'stage' <> p_command->>'stage' then
   if snapshot_settings->>'mode' is distinct from 'manual' then raise exception 'mode-unavailable'; end if;
   update public.learner_practice_runs set status='abandoned' where user_id=p_user_id and run_id=a.run_id and status='active';
   a.run_id := gen_random_uuid(); a.revision := 0;
   r.record := jsonb_build_object('runId',a.run_id,'lessonId',lesson.lesson_id,'lessonVersion',lesson.published_at,
    'lessonName',lesson.title,'language',lesson.language,'level',(p_command->>'level')::int,'stage',(p_command->>'stage')::int,
    'nextUnit',0,'nextPhrase',0,'activeMs',0,'settings',snapshot_settings);
   insert into public.learner_practice_runs(user_id,run_id,record,status) values(p_user_id,a.run_id,r.record,'active');
 end if;
 update public.learner_practice_accounts set instance=instance_id,generation=a.generation+1,lease_until=clock_timestamp()+interval '30 seconds',run_id=a.run_id,revision=a.revision
 where user_id=p_user_id returning * into a;
 result := jsonb_build_object('accountId',p_user_id,'record',r.record,'revision',a.revision,'generation',a.generation,'leaseUntil',a.lease_until);
 insert into public.learner_practice_operations values(p_user_id,operation_id,p_command,result);
 return result;
end;
$$;
revoke all on function public.learner_practice(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.learner_practice(uuid,jsonb) to service_role;

create or replace function public.read_learner_journal(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('accountId',p_user_id,
  'progress',(select r.record from public.learner_practice_accounts a join public.learner_practice_runs r on r.user_id=a.user_id and r.run_id=a.run_id where a.user_id=p_user_id and r.status='active'),
  'history',coalesce((select jsonb_agg(record order by record->>'completedAt' desc) from public.learner_practice_runs where user_id=p_user_id and status='completed'),'[]'::jsonb),
  'studyDays',coalesce((select jsonb_agg(day order by day) from public.learner_study_days where user_id=p_user_id),'[]'::jsonb));
$$;
revoke all on function public.read_learner_journal(uuid) from public,anon,authenticated;
grant execute on function public.read_learner_journal(uuid) to service_role;
