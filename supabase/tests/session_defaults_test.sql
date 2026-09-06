begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select results_eq($$select relrowsecurity from pg_class where oid = 'public.session_defaults'::regclass$$, array[true], 'global defaults have RLS');
select results_eq($$select count(*) from public.session_defaults$$, array[1::bigint], 'one global default row exists');

set local role anon;
select throws_ok($$select * from public.session_defaults$$, '42501', 'permission denied for table session_defaults', 'anonymous clients cannot bypass the learner gate');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"learner"},"user_metadata":{"role":"admin"}}', true);
select results_eq($$select count(*) from public.session_defaults$$, array[0::bigint], 'user-editable metadata does not grant admin access');
select is_empty($$update public.session_defaults set settings = '{"speed":3}' returning id$$, 'non-admin cannot modify defaults');

select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
select results_eq($$select count(*) from public.session_defaults$$, array[1::bigint], 'administrator can read global defaults');
select results_eq($$update public.session_defaults set settings = '{"speed":2}' returning settings ->> 'speed'$$, array['2'::text], 'administrator can update defaults');
select throws_ok($$delete from public.session_defaults$$, '42501', 'permission denied for table session_defaults', 'administrator cannot remove the singleton');

reset role;
select * from finish();
rollback;
