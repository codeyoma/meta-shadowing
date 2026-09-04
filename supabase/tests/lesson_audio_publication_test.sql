begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'audio-admin@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'audio-learner@example.com');

insert into public.lesson_drafts (
  id, created_by, title, language, target_filename, korean_filename,
  target_source, korean_source, parsed_entries, validation_issues,
  validation_status, phrase_count, chapter_count, section_count
) values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'Audio lesson', 'english', 'target.txt', 'ko.txt', 'Hello.', '안녕하세요.',
  '[{"kind":"phrase","sourceLine":1,"phraseNumber":1,"target":"Hello.","korean":"안녕하세요."}]',
  '[]', 'validated', 1, 0, 0
);

select results_eq(
  $$select public, file_size_limit from storage.buckets where id = 'lesson-audio'$$,
  $$values (false, 4194304::bigint)$$,
  'lesson audio bucket is private and limited to four megabytes per object'
);

select results_eq(
  $$select allowed_mime_types::text from storage.buckets where id = 'lesson-audio'$$,
  array['{audio/mpeg,audio/mp4,audio/webm}'::text],
  'lesson audio bucket only accepts the supported audio MIME types'
);

select results_eq(
  $$select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'Lesson audio administrators %'$$,
  array[4::bigint],
  'lesson audio has separate administrator policies for read, insert, update, and delete'
);

insert into storage.objects (bucket_id, name, owner_id) values (
  'lesson-audio',
  '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/001.mp3',
  '11111111-1111-4111-8111-111111111111'
);

set local role anon;
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'lesson-audio'$$,
  array[0::bigint],
  'anonymous clients cannot read private lesson audio objects'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","app_metadata":{"role":"learner"}}',
  true
);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'lesson-audio'$$,
  array[0::bigint],
  'authenticated non-admins cannot read private lesson audio objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values (
      'lesson-audio',
      '22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444/001.mp3',
      '22222222-2222-4222-8222-222222222222'
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'authenticated non-admins cannot upload lesson audio'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values (
      'lesson-audio',
      '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555/001.webm',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  'an administrator can upload under their own user folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values (
      'lesson-audio',
      '22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555555/001.webm',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an administrator cannot upload under another user folder'
);
select lives_ok(
  $$update storage.objects
      set metadata = '{"replaced":true}'
      where bucket_id = 'lesson-audio'
        and name = '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555/001.webm'$$,
  'an administrator can replace an object under their own user folder'
);

select lives_ok(
  $$update public.lesson_drafts
      set audio_manifest = '[{"phraseNumber":1,"sourceLine":1,"originalName":"001-hello.mp3","canonicalName":"001.mp3","contentType":"audio/mpeg","size":12,"path":"11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/001.mp3"}]',
          publication_status = 'published',
          published_at = now()
      where id = '44444444-4444-4444-8444-444444444444'$$,
  'a validated draft with a complete audio manifest can be published'
);
reset role;

select throws_ok(
  $$update public.lesson_drafts
      set audio_manifest = '[]', publication_status = 'published', published_at = now()
      where id = '44444444-4444-4444-8444-444444444444'$$,
  '23514',
  'new row for relation "lesson_drafts" violates check constraint "lesson_drafts_publication_is_complete"',
  'a lesson cannot be published with missing audio'
);

update public.lesson_drafts
set publication_status = 'draft', published_at = null, audio_manifest = '[]',
    validation_status = 'invalid', validation_issues = '[{"code":"empty-phrase"}]';

select throws_ok(
  $$update public.lesson_drafts
      set audio_manifest = '[{"phraseNumber":1}]', publication_status = 'published', published_at = now()
      where id = '44444444-4444-4444-8444-444444444444'$$,
  '23514',
  'new row for relation "lesson_drafts" violates check constraint "lesson_drafts_publication_is_complete"',
  'an invalid text draft cannot be published even with an audio entry'
);

select * from finish();
rollback;
