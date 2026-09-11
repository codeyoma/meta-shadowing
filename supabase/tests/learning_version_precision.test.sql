begin;
select plan(20);

insert into auth.users(id) values ('83333333-3333-4333-8333-333333333333'), ('84444444-4444-4444-8444-444444444444');
create function pg_temp.precision_batch(version jsonb, run_id text default 'micro6') returns jsonb language sql as $$
  select jsonb_build_object('protocolVersion',1,'accountId','83333333-3333-4333-8333-333333333333',
    'runs',jsonb_build_array('{"lessonId":"fictional","lessonName":"A","language":"english","level":1,"stage":1,"nextUnit":0,"nextPhrase":0,"activeMs":0,"settings":{"mode":"manual","display":"current","speed":1,"advanceDelayMs":1000,"groupSize":2,"groupGapMs":500,"wpmLevel":3,"speakingExtraMs":500,"lineGapMs":1000,"sectionGapMs":2000},"confirmedCycles":0}'::jsonb || jsonb_build_object('runId',run_id,'lessonVersion',version)),
    'history','[]'::jsonb,'studyDays','[]'::jsonb);
$$;
create function pg_temp.precision_completion(completed_at jsonb) returns jsonb language sql as $$
  select batch || jsonb_build_object('runs','[]'::jsonb,'history',jsonb_build_array((batch#>'{runs,0}') || jsonb_build_object('completedAt',completed_at)))
  from (select pg_temp.precision_batch(to_jsonb(timestamptz '2026-09-11T01:34:02.123456+00:00')) batch) fixture;
$$;
set local timezone = 'UTC';
set local role authenticated;
set local request.jwt.claims = '{"sub":"83333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":false}';

select lives_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch(to_jsonb(timestamptz '2026-09-11T01:34:02.1234+00:00'),'micro4'))$$,'four-digit PostgreSQL version accepted');
select lives_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch(to_jsonb(timestamptz '2026-09-11T01:34:02.12345+00:00'),'micro5'))$$,'five-digit PostgreSQL version accepted');
select lives_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch(to_jsonb(timestamptz '2026-09-11T01:34:02.123456+00:00')))$$,'six-digit PostgreSQL version accepted');
select is((select jsonb_agg(item->>'lessonVersion' order by item->>'runId') from public.learner_snapshots, jsonb_array_elements(snapshot->'runs') item),
  '["2026-09-11T01:34:02.1234+00:00","2026-09-11T01:34:02.12345+00:00","2026-09-11T01:34:02.123456+00:00"]'::jsonb,'publication version identities are not normalized or truncated');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T01:34:02.123457+00:00"'))$$,'P1001','invalid-merge','same run cannot change version by one microsecond');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T01:34:02.1234567+00:00"'))$$,'P1001','invalid-merge','more than six version digits denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-02-30T01:34:02.123456+00:00"'))$$,'P1001','invalid-merge','impossible version date denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T01:34:02.123456"'))$$,'P1001','invalid-merge','version without timezone denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T24:34:02.123456Z"'))$$,'P1001','invalid-merge','invalid version hour denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T01:34:02.123456+24:00"'))$$,'P1001','invalid-merge','invalid version offset denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('123456'))$$,'P1001','invalid-merge','numeric version denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('{}'))$$,'P1001','invalid-merge','object version denied');
select lives_ok($$select public.merge_learning_snapshot(pg_temp.precision_completion('"2026-09-11T02:00:00.123Z"'))$$,'microsecond package can complete with a millisecond client timestamp');
select is((select snapshot#>>'{history,0,lessonVersion}' from public.learner_snapshots),'2026-09-11T01:34:02.123456+00:00','completion preserves publication version');
select is((select snapshot#>>'{history,0,completedAt}' from public.learner_snapshots),'2026-09-11T02:00:00.123Z','completion timestamp contract unchanged');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_completion('"2026-09-11T02:00:00.1234Z"'))$$,'P1001','invalid-merge','four-digit completion timestamp still denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_completion('"2026-09-11T02:00:00.123456Z"'))$$,'P1001','invalid-merge','six-digit completion timestamp still denied');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T01:34:02.123456+00:00"') || '{"token":"fictional-private-sentinel"}')$$,'P1001','invalid-merge','private fields remain denied with microsecond versions');
set local request.jwt.claims = '{"sub":"84444444-4444-4444-8444-444444444444","role":"authenticated","is_anonymous":false}';
select is((select count(*) from public.learner_snapshots),0::bigint,'foreign account cannot read microsecond history');
select throws_ok($$select public.merge_learning_snapshot(pg_temp.precision_batch('"2026-09-11T01:34:02.123456+00:00"'))$$,'P1004','account-changed','foreign account cannot write microsecond history');
reset role;
select * from finish();
rollback;
