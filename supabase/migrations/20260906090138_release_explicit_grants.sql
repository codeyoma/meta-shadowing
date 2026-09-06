-- Earlier Supabase defaults granted these non-Data-API privileges as well.
-- RLS does not restrict TRUNCATE. Preserve only the explicitly granted browser
-- operations and the existing column-level update whitelist.
revoke all on table public.lesson_drafts from public, anon;
revoke truncate, references, trigger on table public.lesson_drafts from authenticated;
