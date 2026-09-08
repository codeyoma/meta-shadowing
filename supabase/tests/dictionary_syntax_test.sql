begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select ok((select relrowsecurity from pg_class where oid = 'public.dictionary_entries'::regclass), 'dictionary RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.lesson_sentence_syntax'::regclass), 'syntax RLS enabled');
select ok(not has_table_privilege('anon', 'public.dictionary_entries', 'SELECT,INSERT,UPDATE,DELETE'), 'anonymous dictionary table access denied');
select ok(not has_table_privilege('authenticated', 'public.lesson_sentence_syntax', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated clients cannot access syntax or queue paid work');
select ok(not has_function_privilege('authenticated', 'public.claim_sentence_syntax(uuid,integer)', 'EXECUTE'), 'browser cannot call worker RPC');
select ok(has_function_privilege('service_role', 'public.claim_sentence_syntax(uuid,integer)', 'EXECUTE'), 'server can claim work');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.lesson_sentence_analysis'::regclass), 'book analysis view respects invoker permissions');
select ok(not has_table_privilege('anon', 'public.lesson_sentence_analysis', 'SELECT'), 'anonymous book analysis view access denied');
select ok(not has_table_privilege('authenticated', 'public.lesson_sentence_analysis', 'SELECT'), 'browser book analysis view access denied');
select ok(has_table_privilege('service_role', 'public.lesson_sentence_analysis', 'SELECT'), 'server can read book analysis metadata');

insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'syntax-admin@example.com');
insert into public.lesson_drafts (
  id, created_by, title, language, target_filename, korean_filename, target_source, korean_source,
  parsed_entries, validation_issues, validation_status, phrase_count, chapter_count, section_count
) values (
  '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
  'Syntax test', 'english', 'target.txt', 'ko.txt', 'Hello.', '안녕.',
  '[{"kind":"phrase","sourceLine":1,"phraseNumber":1,"target":"Hello.","korean":"안녕."}]', '[]', 'validated', 1, 0, 0
);
insert into public.lesson_sentence_syntax (draft_id, phrase_number, sentence_number, begin_offset, text_content, language_code, text_hash)
select '44444444-4444-4444-8444-444444444444', 1, n, n, 'Hello ' || n, 'en', 'hash-' || n from generate_series(1, 8) n;

set local role service_role;
select is((select min(book_title) from public.lesson_sentence_analysis where draft_id = '44444444-4444-4444-8444-444444444444'), 'Syntax test', 'analysis includes the book title');
select ok((select bool_and(lesson_id = '44444444-4444-4444-8444-444444444444') from public.lesson_sentence_analysis where draft_id = '44444444-4444-4444-8444-444444444444'), 'analysis includes the stable book ID');
select results_eq(
  $$select phrase_number, sentence_number, sentence_index from public.lesson_sentence_analysis where draft_id = '44444444-4444-4444-8444-444444444444' order by sentence_index$$,
  $$select 1, n, n::bigint from generate_series(1, 8) n$$,
  'book sentence sequence preserves original phrase and within-phrase numbers'
);
select is((select count(*) from public.claim_sentence_syntax('44444444-4444-4444-8444-444444444444', 100)), 6::bigint, 'batch capped at six');
select is((select count(*) from public.claim_sentence_syntax('44444444-4444-4444-8444-444444444444', 6)), 2::bigint, 'next worker only claims remaining work');
select is((select count(*) from public.claim_sentence_syntax('44444444-4444-4444-8444-444444444444', 6)), 0::bigint, 'live leases cannot be claimed again');
select is((select min(attempts) from public.lesson_sentence_syntax where draft_id = '44444444-4444-4444-8444-444444444444'), 1, 'attempt count incremented exactly once');

update public.lesson_sentence_syntax set status = 'complete', response = '{"tokens":[]}', lease_id = null where draft_id = '44444444-4444-4444-8444-444444444444' and sentence_number = 1;
update public.lesson_sentence_syntax set status = 'failed', error_code = 'google-429', lease_id = null where draft_id = '44444444-4444-4444-8444-444444444444' and sentence_number = 2;
update public.lesson_sentence_syntax set claimed_at = now() - interval '4 minutes' where draft_id = '44444444-4444-4444-8444-444444444444' and sentence_number = 3;
create temporary table reclaimed as select * from public.claim_sentence_syntax('44444444-4444-4444-8444-444444444444', 6);
select is((select count(*) from reclaimed), 1::bigint, 'only expired processing lease reclaimed; completed and failed remain untouched');
select is((select attempts from reclaimed), 2, 'recovered work increments attempts');
select ok((select lease_id is not null from reclaimed), 'recovered work has a lease token');
update public.lesson_sentence_syntax set status = 'pending', error_code = null where draft_id = '44444444-4444-4444-8444-444444444444' and status = 'failed';
select is((select count(*) from public.claim_sentence_syntax('44444444-4444-4444-8444-444444444444', 6)), 1::bigint, 'explicit retry makes failed work claimable');
select is((select count(*) from public.lesson_sentence_syntax where draft_id = '44444444-4444-4444-8444-444444444444' and status = 'complete'), 1::bigint, 'completed analysis is retained');
select throws_ok($$update public.lesson_sentence_syntax set status = 'complete', response = null where draft_id = '44444444-4444-4444-8444-444444444444' and sentence_number = 4$$, '23514', null, 'completed state requires a persisted result');
delete from public.lesson_drafts where id = '44444444-4444-4444-8444-444444444444';
select is((select count(*) from public.lesson_sentence_syntax where draft_id = '44444444-4444-4444-8444-444444444444'), 0::bigint, 'deleting a draft removes its syntax rows');
reset role;
select * from finish();
rollback;
