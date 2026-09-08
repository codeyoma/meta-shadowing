
-- All modes use the same lease, revision and idempotent checkpoint transaction.
-- Unit offsets are derived only from the locked, published lesson.


CREATE OR REPLACE FUNCTION public.practice_unit_starts(entries jsonb, level integer, group_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
 entry jsonb; segment_count integer:=0; offset_count integer:=0; i integer; starts jsonb:='[]'::jsonb;
begin
 if level not between 1 and 8 or group_size not in (2,3,4) then raise exception 'invalid-command'; end if;
 for entry in select value from jsonb_array_elements(entries || '[{"kind":"end"}]'::jsonb) loop
   if entry->>'kind'='phrase' then segment_count:=segment_count+1;
   else
     i:=0;
     while i<segment_count loop
       if level not in (4,5) or i=0 or segment_count-i>group_size/2.0 then
         starts:=starts || to_jsonb(offset_count+i);
       end if;
       i:=i+case when level in (4,5) then group_size else 1 end;
     end loop;
     offset_count:=offset_count+segment_count; segment_count:=0;
   end if;
 end loop;
 return starts || to_jsonb(offset_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.learner_practice(p_user_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
 a public.learner_practice_accounts; r public.learner_practice_runs; lesson public.lesson_drafts;
 instance_id uuid := (p_command->>'instance')::uuid;
 operation_id uuid := (p_command->>'operation')::uuid;
 result jsonb; saved public.learner_practice_operations;
 action text := p_command->>'action';
 next_unit integer; active_ms bigint; kind text; timezone text;
 units jsonb; unit_count integer; practice_level integer;
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
   practice_level := (r.record->>'level')::int;
   units := coalesce(r.record->'unitStarts', public.practice_unit_starts(lesson.parsed_entries,practice_level,coalesce((r.record->'settings'->>'groupSize')::int,2)));
   unit_count := jsonb_array_length(units)-1;
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
     if next_unit is null or next_unit < 0 or next_unit > unit_count or active_ms is null
       or active_ms < (r.record->>'activeMs')::bigint or active_ms > 9007199254740991
       or kind is null or kind not in ('studied','advance','jump','line','settings') then raise exception 'invalid-checkpoint'; end if;
     if kind in ('studied','settings') and next_unit <> (r.record->>'nextUnit')::integer then raise exception 'invalid-checkpoint'; end if;
     if kind='advance' and (next_unit <> (r.record->>'nextUnit')::integer+1 or coalesce((p_command->>'confirmedCycles')::int,0) not in (3,5)) then raise exception 'invalid-checkpoint'; end if;
     if kind not in ('advance','line') and next_unit=unit_count then raise exception 'invalid-checkpoint'; end if;
     if kind in ('advance','studied') and practice_level>=6 then raise exception 'invalid-checkpoint'; end if;
     if kind='line' and (practice_level<6 or next_unit <> (r.record->>'nextUnit')::int+1) then raise exception 'invalid-checkpoint'; end if;
     if kind='settings' then
       if jsonb_typeof(snapshot_settings) is distinct from 'object' or snapshot_settings='{}'::jsonb
         or snapshot_settings ? 'groupSize' then raise exception 'invalid-command'; end if;
       r.record := jsonb_set(r.record,'{settings}',r.record->'settings' || snapshot_settings);
     end if;
     r.record := r.record || jsonb_build_object('nextUnit',next_unit,'nextPhrase',(units->>next_unit)::int,'activeMs',active_ms,'unitStarts',units);
     if kind in ('studied','line') then
       select study_timezone into strict timezone from public.learner_preferences where user_id=p_user_id;
       insert into public.learner_study_days values(p_user_id,(clock_timestamp() at time zone timezone)::date) on conflict do nothing;
     end if;
     if next_unit=unit_count then
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
 if coalesce((p_command->>'level')::int,0) not between 1 and 8 or coalesce((p_command->>'stage')::int,0) not between ((p_command->>'level')::int * 2 - 1) and ((p_command->>'level')::int * 2)
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
   update public.learner_practice_runs set status='abandoned' where user_id=p_user_id and run_id=a.run_id and status='active';
   a.run_id := gen_random_uuid(); a.revision := 0;
   r.record := jsonb_build_object('runId',a.run_id,'lessonId',lesson.lesson_id,'lessonVersion',lesson.published_at,
    'lessonName',lesson.title,'language',lesson.language,'level',(p_command->>'level')::int,'stage',(p_command->>'stage')::int,
    'nextUnit',0,'nextPhrase',0,'activeMs',0,'settings',snapshot_settings,
    'unitStarts',public.practice_unit_starts(lesson.parsed_entries,(p_command->>'level')::int,coalesce((snapshot_settings->>'groupSize')::int,2)));
   insert into public.learner_practice_runs(user_id,run_id,record,status) values(p_user_id,a.run_id,r.record,'active');
 end if;
 update public.learner_practice_accounts set instance=instance_id,generation=a.generation+1,lease_until=clock_timestamp()+interval '30 seconds',run_id=a.run_id,revision=a.revision
 where user_id=p_user_id returning * into a;
 result := jsonb_build_object('accountId',p_user_id,'record',r.record,'revision',a.revision,'generation',a.generation,'leaseUntil',a.lease_until);
 insert into public.learner_practice_operations values(p_user_id,operation_id,p_command,result);
 return result;
end;
$function$
;



revoke all on function public.practice_unit_starts(jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.practice_unit_starts(jsonb,integer,integer) to service_role;
revoke all on function public.learner_practice(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.learner_practice(uuid,jsonb) to service_role;
