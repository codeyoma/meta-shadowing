begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id) values ('00000000-0000-4000-8000-000000000018');
set local role service_role;
select is(public.get_learner_preferences('00000000-0000-4000-8000-000000000018', 'Asia/Seoul')->'overrides', '{}'::jsonb, 'new account inherits defaults rather than storing a copy');
select is(public.get_learner_preferences('00000000-0000-4000-8000-000000000018', 'America/New_York')->>'studyTimeZone', 'Asia/Seoul', 'another device cannot change the account study calendar');
select is(public.patch_learner_preferences('00000000-0000-4000-8000-000000000018', 0, '{"speed":2}')->'overrides', '{"speed":2}'::jsonb, 'an explicit override is saved');
select is(public.patch_learner_preferences('00000000-0000-4000-8000-000000000018', 0, '{"mode":"automatic"}')->'overrides', '{"speed":2,"mode":"automatic"}'::jsonb, 'independent edits from an older revision are merged');
select is(public.patch_learner_preferences('00000000-0000-4000-8000-000000000018', 0, '{"speed":3}')->'conflict', 'true'::jsonb, 'a concurrent edit of the same field requires reconfirmation');
select is(public.patch_learner_preferences('00000000-0000-4000-8000-000000000018', 0, '{"speed":2}')->'revision', '2'::jsonb, 'retry after a lost response is idempotent');
select is(public.patch_learner_preferences('00000000-0000-4000-8000-000000000018', 0, '{"speed":3,"display":"cumulative"}')->'overrides', '{"speed":2,"mode":"automatic"}'::jsonb, 'a conflict rejects the entire patch');
select throws_ok($$select public.patch_learner_preferences('00000000-0000-4000-8000-000000000018', 9, '{"speed":2}')$$, '22023', 'invalid-revision', 'future revisions are rejected');
reset role;
select ok(not has_table_privilege('anon', 'public.learner_preferences', 'select'), 'anonymous readers have no table grant');
select ok(not has_table_privilege('authenticated', 'public.learner_preferences', 'update'), 'authenticated writers have no table grant');
select ok(not has_function_privilege('authenticated', 'public.patch_learner_preferences(uuid,bigint,jsonb)', 'execute'), 'authenticated users cannot bypass the server patch boundary');
select ok(not has_function_privilege('anon', 'public.get_learner_preferences(uuid,text)', 'execute'), 'anonymous users cannot initialize accounts');
-- Defense in depth: even an accidental SELECT grant does not expose rows.
grant select on public.learner_preferences to authenticated;
set local role authenticated;
select is((select count(*)::integer from public.learner_preferences), 0, 'default-deny RLS hides all accounts');
reset role;

select * from finish();
rollback;
