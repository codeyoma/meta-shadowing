-- Uses the same account lock as start/checkpoint/renew/release. The observed
-- generation is confirmation intent, not a request to steal any future owner.
create or replace function public.takeover_learner_practice(p_user_id uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a public.learner_practice_accounts; r public.learner_practice_runs;
 lesson public.lesson_drafts; saved public.learner_practice_operations;
 instance_id uuid := (p_command->>'instance')::uuid;
 operation_id uuid := (p_command->>'operation')::uuid;
 result jsonb;
begin
 if instance_id is null or operation_id is null or p_command->>'action' is distinct from 'takeover'
   or (p_command->>'runId')::uuid is null or (p_command->>'generation')::bigint is null then raise exception 'invalid-command'; end if;
 select * into a from public.learner_practice_accounts where user_id=p_user_id for update;
 if not found then raise exception 'ownership-lost'; end if;
 select * into saved from public.learner_practice_operations where user_id=p_user_id and operation=operation_id;
 if found then
   if saved.request is distinct from p_command then raise exception 'operation-conflict'; end if;
   if a.instance is distinct from instance_id or a.generation is distinct from (saved.result->>'generation')::bigint
     or a.run_id is distinct from (p_command->>'runId')::uuid or a.lease_until is null or a.lease_until<=clock_timestamp() then raise exception 'ownership-lost'; end if;
   return saved.result;
 end if;
 if a.generation is distinct from (p_command->>'generation')::bigint
   or a.run_id is distinct from (p_command->>'runId')::uuid then raise exception 'ownership-lost'; end if;
 select * into r from public.learner_practice_runs where user_id=p_user_id and run_id=a.run_id;
 if not found or r.status<>'active' then raise exception 'run-completed'; end if;
 select * into lesson from public.lesson_drafts where lesson_id=(r.record->>'lessonId')::uuid and publication_status='published' for share;
 if not found or lesson.published_at is distinct from (r.record->>'lessonVersion')::timestamptz then raise exception 'lesson-version-changed'; end if;
 update public.learner_practice_accounts set instance=instance_id,generation=a.generation+1,lease_until=clock_timestamp()+interval '30 seconds'
 where user_id=p_user_id returning * into a;
 result:=jsonb_build_object('accountId',p_user_id,'record',r.record,'revision',a.revision,'generation',a.generation,'leaseUntil',a.lease_until);
 insert into public.learner_practice_operations values(p_user_id,operation_id,p_command,result);
 return result;
end;
$$;
revoke all on function public.takeover_learner_practice(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.takeover_learner_practice(uuid,jsonb) to service_role;

create or replace function public.read_learner_journal(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('accountId',p_user_id,
  'progress',(select r.record from public.learner_practice_accounts a join public.learner_practice_runs r on r.user_id=a.user_id and r.run_id=a.run_id where a.user_id=p_user_id and r.status='active'),
  'activeLease',(select jsonb_build_object('runId',a.run_id,'generation',a.generation,'leaseUntil',a.lease_until)
    from public.learner_practice_accounts a join public.learner_practice_runs r on r.user_id=a.user_id and r.run_id=a.run_id
    where a.user_id=p_user_id and r.status='active' and a.instance is not null and a.lease_until>statement_timestamp()),
  'history',coalesce((select jsonb_agg(record order by record->>'completedAt' desc) from public.learner_practice_runs where user_id=p_user_id and status='completed'),'[]'::jsonb),
  'studyDays',coalesce((select jsonb_agg(day order by day) from public.learner_study_days where user_id=p_user_id),'[]'::jsonb));
$$;
revoke all on function public.read_learner_journal(uuid) from public,anon,authenticated;
grant execute on function public.read_learner_journal(uuid) to service_role;
