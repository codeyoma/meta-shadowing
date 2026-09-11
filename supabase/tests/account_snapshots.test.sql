begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select has_table('public', 'learner_snapshots', 'snapshot table exists');
select col_is_pk('public', 'learner_snapshots', 'account_id', 'account identity is the primary key');
select ok(not has_table_privilege('public', 'public.learner_snapshots', 'select,insert,update,delete'), 'PUBLIC has no table grants');
select ok(not has_table_privilege('anon', 'public.learner_snapshots', 'select,insert,update,delete'), 'anonymous users have no table grants');
select ok(has_table_privilege('authenticated', 'public.learner_snapshots', 'select') and not has_table_privilege('authenticated', 'public.learner_snapshots', 'insert,update'), 'authenticated users can only read directly');
select ok(not has_table_privilege('authenticated', 'public.learner_snapshots', 'delete'), 'authenticated users cannot delete snapshots');

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false}';
select lives_ok($$select public.merge_learning_snapshot('{"protocolVersion":1,"accountId":"11111111-1111-4111-8111-111111111111","runs":[],"history":[],"studyDays":[]}')$$,
  'A establishes its own snapshot through merge');
select cmp_ok((select updated_at from public.learner_snapshots), '>', '2000-01-01T00:00:00Z'::timestamptz,
  'database replaces a supplied insert timestamp');
select results_eq($$select account_id::text from public.learner_snapshots$$,
  array['11111111-1111-4111-8111-111111111111'], 'A reads its own snapshot');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('22222222-2222-4222-8222-222222222222', 1,
    '{"schemaVersion":1,"accountId":"22222222-2222-4222-8222-222222222222","preferredLevel":1,"settings":{},"runs":[],"history":[],"studyDays":[]}'::jsonb)$$,
  '42501', null, 'A cannot insert B');

reset role;
insert into public.learner_snapshots(account_id, schema_version, snapshot) values
  ('22222222-2222-4222-8222-222222222222', 1,
   '{"schemaVersion":1,"accountId":"22222222-2222-4222-8222-222222222222","preferredLevel":1,"settings":{},"runs":[],"history":[],"studyDays":[]}'::jsonb);
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';
select is((select count(*)::integer from public.learner_snapshots), 1, 'A cannot read B');
select throws_ok($$update public.learner_snapshots set schema_version = 1
  where account_id = '22222222-2222-4222-8222-222222222222' returning 1$$,
  '42501', null, 'A cannot update B');
select throws_ok($$update public.learner_snapshots set account_id = '22222222-2222-4222-8222-222222222222'
  where account_id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'A cannot reassign ownership');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot, updated_at)
  values ('11111111-1111-4111-8111-111111111111', 1,
    '{"schemaVersion":1,"accountId":"11111111-1111-4111-8111-111111111111","preferredLevel":8,"settings":{},"runs":[],"history":[],"studyDays":[]}'::jsonb,
    '2000-01-01T00:00:00Z')
  on conflict (account_id) do update set schema_version = excluded.schema_version,
    snapshot = excluded.snapshot, updated_at = excluded.updated_at$$, '42501', null, 'legacy own replacement is denied');
select is((select snapshot->>'preferredLevel' from public.learner_snapshots), '1', 'denied replacement preserves existing options');
select cmp_ok((select updated_at from public.learner_snapshots), '>', '2000-01-01T00:00:00Z'::timestamptz,
  'database assigns the replacement timestamp');

reset role;
insert into auth.users (id) values
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('33333333-3333-4333-8333-333333333333', 2,
    '{"schemaVersion":2,"accountId":"33333333-3333-4333-8333-333333333333","preferredLevel":1,"settings":{},"runs":[],"history":[],"studyDays":[]}'::jsonb)$$,
  '23514', null, 'unsupported schema version is rejected');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('44444444-4444-4444-8444-444444444444', 1, '[]'::jsonb)$$,
  '23514', null, 'non-object snapshot is rejected');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('55555555-5555-4555-8555-555555555555', 1,
    '{"schemaVersion":1,"accountId":"22222222-2222-4222-8222-222222222222"}'::jsonb)$$,
  '23514', null, 'snapshot identity must match its row owner');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('66666666-6666-4666-8666-666666666666', 1,
    jsonb_build_object('schemaVersion',1,'accountId','66666666-6666-4666-8666-666666666666',
      'preferredLevel',1,'settings','{}'::jsonb,'runs','[]'::jsonb,'history','[]'::jsonb,'studyDays','[]'::jsonb,
      'padding',repeat('x',2097152)))$$,
  '23514', null, 'oversized stored JSON is rejected');

select is(
  private.account_snapshot_json_bytes($json${"value":"comma, colon: escaped \"quote\" \\ slash 한"}$json$::jsonb),
  octet_length($json${"value":"comma, colon: escaped \"quote\" \\ slash 한"}$json$)::bigint,
  'compact byte counting preserves punctuation, escapes, backslashes, and non-ASCII string content'
);
with base as (
  select jsonb_build_object(
    'schemaVersion', 1, 'accountId', '77777777-7777-4777-8777-777777777777', 'preferredLevel', 1,
    'settings', '{}'::jsonb,
    'runs', jsonb_build_array(jsonb_build_object(
      'runId', 'near-limit', 'lessonId', 'lesson', 'lessonVersion', '2026-09-10T00:00:00.000Z',
      'lessonName', '', 'language', 'english', 'level', 1, 'stage', 2, 'nextUnit', 0,
      'nextPhrase', 0, 'activeMs', 0,
      'settings', '{"mode":"manual","display":"current","speed":1,"advanceDelayMs":1000,"groupSize":2,"groupGapMs":500,"wpmLevel":1,"speakingExtraMs":0,"lineGapMs":0,"sectionGapMs":0}'::jsonb,
      'confirmedCycles', 0)),
    'history', '[]'::jsonb, 'studyDays', '[]'::jsonb
  ) snapshot
), near_limit as (
  select jsonb_set(snapshot, '{runs,0,lessonName}',
    to_jsonb(repeat('x', (2097152 - private.account_snapshot_json_bytes(snapshot))::integer))) snapshot
  from base
)
select lives_ok(format(
  'insert into public.learner_snapshots(account_id, schema_version, snapshot) values (%L, 1, %L::jsonb)',
  '77777777-7777-4777-8777-777777777777', snapshot::text
), 'a valid compact snapshot at exactly 2 MiB is accepted') from near_limit;
select is(private.account_snapshot_json_bytes(snapshot), 2097152::bigint,
  'the near-limit snapshot round-trips at the exact compact byte boundary')
from public.learner_snapshots where account_id = '77777777-7777-4777-8777-777777777777';

set local role anon;
select throws_ok($$select * from public.learner_snapshots$$, '42501', null, 'anonymous reads are denied');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('11111111-1111-4111-8111-111111111111', 1, '{}'::jsonb)$$,
  '42501', null, 'anonymous inserts are denied');
select throws_ok($$update public.learner_snapshots set snapshot = '{}'::jsonb$$,
  '42501', null, 'anonymous updates are denied');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true}';
select is((select count(*)::integer from public.learner_snapshots), 0,
  'authenticated anonymous users cannot read their owner row');
select throws_ok($$insert into public.learner_snapshots(account_id, schema_version, snapshot)
  values ('11111111-1111-4111-8111-111111111111', 1,
    '{"schemaVersion":1,"accountId":"11111111-1111-4111-8111-111111111111","preferredLevel":1,"settings":{},"runs":[],"history":[],"studyDays":[]}'::jsonb)
  on conflict (account_id) do update set snapshot = excluded.snapshot$$,
  '42501', null, 'authenticated anonymous users cannot replace their owner row');

reset role;
select * from finish();
rollback;
