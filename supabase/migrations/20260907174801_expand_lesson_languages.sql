alter table public.lesson_drafts
  drop constraint lesson_drafts_language_check,
  add constraint lesson_drafts_language_check
    check (language in ('english', 'japanese', 'chinese', 'german', 'french'));
