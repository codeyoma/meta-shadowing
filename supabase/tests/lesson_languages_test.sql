begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email)
values ('33333333-3333-4333-8333-333333333333', 'language-test@example.com');

select lives_ok(
  $$insert into public.lesson_drafts (
      created_by, title, language, target_filename, korean_filename,
      target_source, korean_source, parsed_entries, validation_issues,
      validation_status, phrase_count, chapter_count, section_count
    ) select
      '33333333-3333-4333-8333-333333333333', language, language,
      'target.txt', 'ko.txt', 'Target.', '번역.',
      '[{"kind":"phrase"}]', '[]', 'validated', 1, 0, 0
    from unnest(array['english', 'japanese', 'chinese', 'german', 'french']) as language$$,
  'lesson drafts accept every learner language'
);

select throws_ok(
  $$insert into public.lesson_drafts (
      created_by, title, language, target_filename, korean_filename,
      target_source, korean_source, parsed_entries, validation_issues,
      validation_status, phrase_count, chapter_count, section_count
    ) values (
      '33333333-3333-4333-8333-333333333333', 'Unsupported', 'spanish',
      'target.txt', 'ko.txt', 'Target.', '번역.',
      '[{"kind":"phrase"}]', '[]', 'validated', 1, 0, 0
    )$$,
  '23514',
  'new row for relation "lesson_drafts" violates check constraint "lesson_drafts_language_check"',
  'lesson drafts reject languages outside the learner catalog'
);

select * from finish();
rollback;
