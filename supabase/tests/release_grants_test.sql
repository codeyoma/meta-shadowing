begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(has_table_privilege('authenticated', 'public.lesson_drafts', 'SELECT') and has_table_privilege('authenticated', 'public.lesson_drafts', 'INSERT'), 'draft Data API access is explicitly granted to authenticated');
select ok(has_column_privilege('authenticated', 'public.lesson_drafts', 'title', 'UPDATE'), 'admins can update draft content through RLS');
select ok(not has_column_privilege('authenticated', 'public.lesson_drafts', 'published_at', 'UPDATE'), 'clients cannot bypass the publication RPC');
select ok(not has_table_privilege('authenticated', 'public.lesson_drafts', 'DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'clients cannot delete, truncate, reference, or attach triggers to lesson drafts');
select ok(not has_table_privilege('anon', 'public.lesson_drafts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'anonymous clients have no draft table privileges');
select ok(has_table_privilege('service_role', 'public.lesson_drafts', 'SELECT') and has_table_privilege('service_role', 'public.lesson_drafts', 'DELETE'), 'server catalog and lifecycle privileges are explicit');
select ok(has_table_privilege('authenticated', 'public.session_defaults', 'SELECT') and has_column_privilege('authenticated', 'public.session_defaults', 'settings', 'UPDATE'), 'global defaults have explicit read and column-update grants');
select ok(not has_table_privilege('authenticated', 'public.session_defaults', 'INSERT,DELETE,TRUNCATE'), 'clients cannot create or remove the settings singleton');
select is_empty($$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('publish_lesson_draft', 'import_lesson_replacement', 'unpublish_lesson', 'begin_lesson_deletion') and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))$$, 'lifecycle RPCs are not callable by browser roles');
select results_eq($$select public from storage.buckets where id = 'lesson-audio'$$, array[false], 'release audio storage remains private');

select * from finish();
rollback;
