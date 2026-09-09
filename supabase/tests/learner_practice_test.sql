begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000019');
insert into public.lesson_drafts(id, created_by, title, language, target_filename, korean_filename,
 target_source, korean_source, parsed_entries, validation_status, phrase_count, chapter_count, section_count)
values ('19000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000019',
 'Practice test','english','en.txt','ko.txt','Hello','안녕','[{"kind":"phrase"}]','validated',1,0,0);
update public.lesson_drafts set publication_status='published',published_at='2026-09-08T00:00:00Z',
 audio_manifest='[{"phraseNumber":1,"path":"test/1.mp3"}]' where id='19000000-0000-4000-8000-000000000019';
set local role service_role;
select public.get_learner_preferences('00000000-0000-4000-8000-000000000019','Asia/Seoul');
select is(public.learner_practice('00000000-0000-4000-8000-000000000019',
 '{"action":"start","instance":"19000000-0000-4000-8000-000000000001","operation":"19000000-0000-4000-8000-000000000002","lessonId":"19000000-0000-4000-8000-000000000019","lessonVersion":"2026-09-08T00:00:00Z","level":1,"stage":1,"settings":{"mode":"manual"}}')->'record'->>'nextUnit', '0', 'start acquires ownership at the first confirmed checkpoint');
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',
 '{"action":"start","instance":"19000000-0000-4000-8000-000000000003","operation":"19000000-0000-4000-8000-000000000004","lessonId":"19000000-0000-4000-8000-000000000019","lessonVersion":"2026-09-08T00:00:00Z","level":1,"stage":1,"settings":{"mode":"manual"}}')$$,
 'P0001','session-busy','another device cannot acquire an active account');
select set_config('test.start', public.learner_practice('00000000-0000-4000-8000-000000000019',
 '{"action":"start","instance":"19000000-0000-4000-8000-000000000001","operation":"19000000-0000-4000-8000-000000000002","lessonId":"19000000-0000-4000-8000-000000000019","lessonVersion":"2026-09-08T00:00:00Z","level":1,"stage":1,"settings":{"mode":"manual"}}')::text,true);
select set_config('test.commit', (jsonb_build_object('action','checkpoint','instance','19000000-0000-4000-8000-000000000001',
 'operation','19000000-0000-4000-8000-000000000005','runId',current_setting('test.start')::jsonb->'record'->>'runId',
 'generation',1,'revision',0,'kind','studied','nextUnit',0,'activeMs',1200))::text,true);
select is(public.learner_practice('00000000-0000-4000-8000-000000000019',
 '{"action":"start","instance":"19000000-0000-4000-8000-000000000001","operation":"19000000-0000-4000-8000-000000000002","lessonId":"19000000-0000-4000-8000-000000000019","lessonVersion":"2026-09-08T00:00:00Z","level":1,"stage":1,"settings":{"mode":"automatic","speed":2}}')->'record'->'settings'->>'mode','manual','start retry retains the original snapshot when server preferences changed');
select is(public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb)->>'revision','1','confirmed practice saves one revision');
select is(public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb)->>'revision','1','lost response retry returns the original acknowledgment');
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb || '{"activeMs":1500}')$$,'P0001','operation-conflict','operation IDs cannot be reused with different content');
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb || '{"operation":"19000000-0000-4000-8000-000000000006"}')$$,'P0001','revision-conflict','stale revisions cannot overwrite progress');
select is(public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb || '{"operation":"19000000-0000-4000-8000-000000000007","revision":1,"kind":"advance","nextUnit":1,"confirmedCycles":3}') -> 'record' ->>'activeMs','1200','completion keeps cumulative time without double counting');
select is(jsonb_array_length(public.read_learner_journal('00000000-0000-4000-8000-000000000019')->'history'),1,'completion is visible through the account journal');
select is(public.read_learner_journal('00000000-0000-4000-8000-000000000019')->'history'->0->>'lessonVersion','2026-09-08T00:00:00+00:00','snapshot version uses the published catalog representation');
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb || '{"operation":"19000000-0000-4000-8000-000000000008","revision":2}')$$,'P0001','run-completed','a completed run cannot recreate progress');
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb || '{"generation":2}')$$,'P0001','ownership-lost','even a replay checks the current lease generation');
select is(jsonb_array_length(public.read_learner_journal('00000000-0000-4000-8000-000000000019')->'studyDays'),1,'confirmed practice earns exactly one calendar day');
reset role;
select ok(not has_table_privilege('authenticated','public.learner_practice_runs','select'),'learners cannot read tables directly');
select ok(not has_function_privilege('anon','public.learner_practice(uuid,jsonb)','execute'),'anonymous RPC execution is revoked');
select ok(not has_function_privilege('authenticated','public.read_learner_journal(uuid)','execute'),'account journal identity cannot be forged through the Data API');
update public.learner_practice_accounts set lease_until=clock_timestamp()-interval '1 second' where user_id='00000000-0000-4000-8000-000000000019';
set local role service_role;
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',current_setting('test.commit')::jsonb)$$,'P0001','ownership-lost','expiry fences a stale retry without trusting browser timers');
select is(public.learner_practice('00000000-0000-4000-8000-000000000019',
 '{"action":"start","instance":"19000000-0000-4000-8000-000000000003","operation":"19000000-0000-4000-8000-000000000009","lessonId":"19000000-0000-4000-8000-000000000019","lessonVersion":"2026-09-08T00:00:00Z","level":1,"stage":1,"settings":{"mode":"manual"}}')->>'generation','2','a new instance can start after expiry');
reset role;
update public.lesson_drafts set published_at='2026-09-09T00:00:00Z',title='Replacement'
 where id='19000000-0000-4000-8000-000000000019';
set local role service_role;
select throws_ok($$select public.learner_practice('00000000-0000-4000-8000-000000000019',
 jsonb_build_object('action','renew','instance','19000000-0000-4000-8000-000000000003','generation',2,
 'runId',public.read_learner_journal('00000000-0000-4000-8000-000000000019')->'progress'->>'runId'))$$,
 'P0001','lesson-version-changed','republication fences the old run');
select is(public.read_learner_journal('00000000-0000-4000-8000-000000000019')->'history'->0->>'lessonName',
 'Practice test','completed history retains its original lesson snapshot');
reset role;
select * from finish();
rollback;
