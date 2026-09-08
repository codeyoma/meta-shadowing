-- Book metadata stays tied to the exact imported version through draft_id.
-- This private read view keeps it visible alongside every stored analysis.
create view public.lesson_sentence_analysis
with (security_invoker = true) as
select
  s.id as analysis_id,
  d.lesson_id,
  d.title as book_title,
  s.draft_id,
  d.publication_status,
  d.published_at,
  row_number() over (
    partition by s.draft_id order by s.phrase_number, s.sentence_number
  ) as sentence_index,
  s.phrase_number,
  s.sentence_number,
  s.begin_offset,
  s.text_content,
  s.language_code,
  s.status,
  s.response,
  s.analyzer_version,
  s.attempts,
  s.error_code,
  s.completed_at
from public.lesson_sentence_syntax s
join public.lesson_drafts d on d.id = s.draft_id;

comment on view public.lesson_sentence_analysis is
  'Server-only book/version metadata and stored Google syntax results. Order by draft_id, phrase_number, sentence_number.';
comment on column public.lesson_sentence_analysis.sentence_index is
  'One-based sentence position within the imported book version; computed across all stored statuses.';
comment on column public.lesson_sentence_analysis.phrase_number is
  'Original one-based numbered phrase in the book. Preserves the source and audio mapping.';
comment on column public.lesson_sentence_analysis.sentence_number is
  'One-based sentence within its source phrase; dialogues can have several sentences.';

revoke all on public.lesson_sentence_analysis from public, anon, authenticated;
grant select on public.lesson_sentence_analysis to service_role;
