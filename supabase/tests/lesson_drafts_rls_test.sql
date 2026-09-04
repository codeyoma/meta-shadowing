begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin-one@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'admin-two@example.com');

insert into public.lesson_drafts (
  created_by, title, language, target_filename, korean_filename,
  target_source, korean_source, parsed_entries, validation_issues,
  validation_status, phrase_count, chapter_count, section_count
) values
  (
    '11111111-1111-4111-8111-111111111111', 'Admin one draft', 'english',
    'target.txt', 'ko.txt', 'Hello.', '안녕하세요.',
    '[{"kind":"phrase","sourceLine":1,"phraseNumber":1,"target":"Hello.","korean":"안녕하세요."}]',
    '[]', 'validated', 1, 0, 0
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'Admin two draft', 'japanese',
    'target.txt', 'ko.txt', 'こんにちは。', '안녕하세요.',
    '[{"kind":"phrase","sourceLine":1,"phraseNumber":1,"target":"こんにちは。","korean":"안녕하세요."}]',
    '[]', 'validated', 1, 0, 0
  );

select results_eq(
  $$select relrowsecurity from pg_class where oid = 'public.lesson_drafts'::regclass$$,
  array[true],
  'lesson_drafts has RLS enabled'
);

select results_eq(
  $$select count(*) from pg_policies where schemaname = 'public' and tablename = 'lesson_drafts'$$,
  array[4::bigint],
  'lesson_drafts has separate select, insert, update, and delete policies'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.lesson_drafts$$,
  '42501',
  'permission denied for table lesson_drafts',
  'anonymous requests cannot read lesson drafts'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"learner"}}',
  true
);
select results_eq(
  $$select count(*) from public.lesson_drafts$$,
  array[0::bigint],
  'an authenticated non-admin cannot read even their own draft'
);
select throws_ok(
  $$insert into public.lesson_drafts (
      created_by, title, language, target_filename, korean_filename,
      target_source, korean_source, parsed_entries, validation_issues,
      validation_status, phrase_count, chapter_count, section_count
    ) values (
      '11111111-1111-4111-8111-111111111111', 'Rejected draft', 'english',
      'target.txt', 'ko.txt', 'Hello.', '안녕하세요.', '[]', '[]', 'validated', 1, 0, 0
    )$$,
  '42501',
  'new row violates row-level security policy for table "lesson_drafts"',
  'an authenticated non-admin cannot create a draft'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select results_eq(
  $$select title from public.lesson_drafts order by title$$,
  array['Admin one draft'::text],
  'an administrator only sees drafts they own'
);
select lives_ok(
  $$insert into public.lesson_drafts (
      created_by, title, language, target_filename, korean_filename,
      target_source, korean_source, parsed_entries, validation_issues,
      validation_status, phrase_count, chapter_count, section_count
    ) values (
      '11111111-1111-4111-8111-111111111111', 'Allowed draft', 'english',
      'target.txt', 'ko.txt', 'Hello.', '안녕하세요.',
      '[{"kind":"phrase"}]', '[]', 'validated', 1, 0, 0
    )$$,
  'an administrator can create their own validated draft'
);
select throws_ok(
  $$insert into public.lesson_drafts (
      created_by, title, language, target_filename, korean_filename,
      target_source, korean_source, parsed_entries, validation_issues,
      validation_status, phrase_count, chapter_count, section_count
    ) values (
      '22222222-2222-4222-8222-222222222222', 'Other owner', 'english',
      'target.txt', 'ko.txt', 'Hello.', '안녕하세요.',
      '[{"kind":"phrase"}]', '[]', 'validated', 1, 0, 0
    )$$,
  '42501',
  'new row violates row-level security policy for table "lesson_drafts"',
  'an administrator cannot create a draft for another owner'
);
reset role;

select throws_ok(
  $$insert into public.lesson_drafts (
      created_by, title, language, target_filename, korean_filename,
      target_source, korean_source, parsed_entries, validation_issues,
      validation_status, phrase_count, chapter_count, section_count
    ) values (
      '11111111-1111-4111-8111-111111111111', 'Invalid status', 'english',
      'target.txt', 'ko.txt', 'Hello.', '안녕하세요.',
      '[{"kind":"phrase"}]', '[{"code":"empty-phrase"}]', 'validated', 1, 0, 0
    )$$,
  '23514',
  'new row for relation "lesson_drafts" violates check constraint "lesson_drafts_validation_status_matches_issues"',
  'a draft with validation issues cannot be marked validated'
);

select * from finish();
rollback;
