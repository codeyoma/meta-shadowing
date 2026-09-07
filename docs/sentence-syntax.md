# Dictionary and sentence analysis setup

The player uses the imported Korean Wiktionary data described in [kaikki-dictionary.md](kaikki-dictionary.md). Word buttons appear only on visible foreign-language text, pause playback, and open a dictionary dialog. The existing learner UI supports English and Japanese; the dictionary data/API also accepts Chinese, Spanish, German, and French. A definition is a dictionary sense, not a guaranteed interpretation of the current sentence.

## Google configuration

1. In your Google Cloud project, enable **Cloud Natural Language API** (`language.googleapis.com`) and set up billing as required by Google.
2. Use either a service account JSON key or a restricted server API key. For a downloaded service account key, store the JSON outside this repository and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path in `.env.local`. For example: `GOOGLE_APPLICATION_CREDENTIALS="/absolute/private/path/natural-language.json"`. This is a server-to-server flow; it does not need an OAuth consent screen for learners. Never paste the JSON into `GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY`.
3. Alternatively, create a server API key restricted to **Cloud Natural Language API**, then set `GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY`. A nonempty API key takes precedence over the JSON path. Restart the development server after configuring or rotating credentials. For deployment, provide credentials through the host's server secret configuration; a path on your Mac is not available on the deployed server. Keep both the JSON and API key out of source control and `NEXT_PUBLIC_*` variables.
4. Save a new lesson draft. Its analysis panel starts processing automatically. For a previously saved or published lesson, open **레슨 관리** and choose **분석 시작 / 이어서 분석**. No re-upload is needed.

Use the existing Supabase server configuration (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) and apply `add_dictionary_and_sentence_syntax` before importing data or saving analysis. Browser database roles have no table/RPC permissions for this feature; authenticated application routes perform the reads and writes on the server.

Official references: [Google API setup](https://cloud.google.com/natural-language/docs/setup), [API-key authentication](https://cloud.google.com/docs/authentication/api-keys-use), [Syntax Analysis](https://cloud.google.com/natural-language/docs/analyzing-syntax), [pricing](https://cloud.google.com/natural-language/pricing).

The service account path uses Google's `google-auth-library` JWT client with the `cloud-language` scope. Only `type: "service_account"` JSON files are accepted; signing fields are passed explicitly, without custom token endpoints or executable credentials. The process reuses the client and its automatically refreshed access token. Token requests have a ten-second transport timeout; analysis requests retain their twelve-second timeout and have no automatic provider retries. Authentication errors are reduced to safe status codes before storage or display. Configuration presence is not a successful connectivity check: a missing, invalid, revoked, or unauthorized key still produces a specific analysis failure. No `gcloud` installation is needed for this application flow.

## Registration and recovery

- Saving a draft creates `lesson_sentence_syntax` rows with phrase number, sentence number, text, language, a text hash, and a UTF16 offset within the original phrase. Sentence segmentation does not change the phrase/audio numbering. A multi-line dialogue remains one audio phrase with several analysis rows.
- The panel calls the administrator-only `POST /api/admin/drafts/:id/syntax` endpoint in batches of six, with up to three concurrent Google requests. Each request uses `documents:analyzeSyntax` with `PLAIN_TEXT`, an explicit language, and `encodingType: UTF16`.
- Completed rows store the full validated Google response (sentences, tokens, lemma, part-of-speech features, dependency edges), the analyzer version, and completion time. Token offsets are relative to the stored sentence; add the row's `begin_offset` to address the original phrase. These are linguistic annotations, not generated Korean grammar explanations.
- The panel must stay open to drain all batches. Closing it preserves completed/pending rows. A request interrupted after claiming work can be recovered after its three-minute lease expires, using the lesson-management panel. This implementation does not install a separate cron worker.
- Without credentials, draft saving still succeeds and work remains pending. Provider failures are recorded separately. **실패한 문장 다시 분석** explicitly retries failed rows once; automatic batches never loop on failures. A failed initialization can also be repaired by the next processing request.
- Atomic row claims and conditional lease updates prevent two tabs from processing the same active row. Completed rows are not reanalyzed. An existing completed response with identical language/text/version can be reused across drafts. Identical text in separate concurrent requests can still miss this cache, and a crash after Google responds but before persistence can require another provider call; the provider does not give an exactly-once billing guarantee.
- Draft ownership and lesson deletion state are checked before processing. Deleting a lesson version cascades to its sentence analyses. Imported public dictionary entries remain available to other lessons.

## Inspecting stored results

`lesson_sentence_syntax` persists each response and its source location. The private `lesson_sentence_analysis` view joins the exact imported book version so the Supabase Table Editor or an administrator's SQL query can show:

- `lesson_id`, `book_title`: the stable book ID and that version's title.
- `draft_id`, `published_at`: the exact imported version and its publication time.
- `phrase_number`: the original numbered phrase, preserving the audio/source mapping.
- `sentence_number`: the sentence within that phrase, starting at one for each phrase.
- `sentence_index`: a one-based sequence across all stored sentences in that version, including pending/failed rows.
- `text_content`, `language_code`, `response`: original sentence and full validated Google result.
- `status`, `completed_at`, `attempts`, `error_code`: completion and recovery information.

For example, a two-sentence dialogue in phrase 42 produces `phrase_number = 42` with `sentence_number = 1` and `2`. Book titles are joined rather than copied into every row, so a draft title edit cannot leave stale duplicate metadata. Results from replacement versions remain tied to their own `draft_id`. The view uses `security_invoker` and only grants access to `service_role`, like the underlying analysis table.

```sql
select book_title, lesson_id, draft_id, sentence_index,
       phrase_number, sentence_number, text_content, status, response
from public.lesson_sentence_analysis
order by book_title, draft_id, phrase_number, sentence_number;
```

## Usage

### Learner analysis popup

The player has a **문장 분석** action on the right of the current section heading, including lessons without a chapter heading. Opening it pauses audio or rapid playback and blocks player shortcuts until the dialog closes; closing restores focus to its trigger without resuming playback. In levels 3 and 5, reveal subtitles first to enable the action. Grouped playback requests the currently active phrase, not the group's first phrase.

`GET /api/lessons/:id/syntax/:phraseNumber?version=:publishedAt` requires learner access and reads the private `lesson_sentence_analysis` view through the server client. It filters stable lesson ID, `publication_status = published`, the exact publication timestamp, and phrase number in one query. A replaced/unpublished version or missing analysis returns no sentences. Responses use `private, no-store` and `Vary: Cookie`; neither raw provider errors nor lease metadata is exposed. The route never seeds rows, calls Google, or retries analysis.

The popup preserves multiple sentence boundaries and shows the original text, Korean part-of-speech labels, lemma, known morphological features, and a selected token's dependency relationship. Korean labels explain Google's stored annotations using the [Token reference](https://docs.cloud.google.com/natural-language/docs/reference/rest/v1/Token); they are not a newly generated translation or a corrected parse. Unknown morphology is omitted, and ROOT is called the parse's center rather than assumed to be a verb. Google can misclassify a word or attach a modifier incorrectly; the UI identifies these as automatic results. Empty, pending, failed, expired-access, and read-error states remain distinct.

Popup verification covers authenticated/version-scoped reads, stored-response validation, multiple sentences, word details, media/timer pausing, focus restoration, hint visibility, phrase selection, and retry/empty states. Live read-only verification at 430×932 and 1280×900 displayed an existing book's phrase 7 (two sentences, 20 tokens), checked lemma/tense and modifier relations, and confirmed anonymous reads are rejected and stale versions return no results. This verifies faithful rendering of stored data, not linguistic accuracy.

### Analysis volume

The panel estimates units by rounding each sentence up to the next 1,000 Unicode characters. Google currently lists the first 5,000 syntax units per month as free. At 500 short sentences per week, four to five weeks represent about 2,000–2,500 units before retries, long sentences, or other project usage. This is an estimate, not a spending cap; configure project quotas and billing alerts to match your budget. Sentences longer than 20,000 characters are marked failed rather than silently truncated.

## Verification boundaries

Unit tests cover sentence offsets, provider request encoding, API-key and service-account authentication, invalid or missing JSON files, token-client reuse, safe authentication errors, invalid responses, no-credentials behavior, ownership checks, completed-result reuse, error persistence, and route authorization. SQL tests exercise server-only permissions, atomic claims, lease recovery, explicit retries, result requirements, and cascade deletion. Browser tests mock the provider status responses to exercise automatic processing and retries without billable calls. Real Google verification requires configured credentials; mocks do not demonstrate Google service access or linguistic accuracy.

The opt-in `src/lib/sentence-syntax.integration.test.ts` additionally exercises the real repository against local Supabase. It requires `SYNTAX_SUPABASE_INTEGRATION=1` and explicit `SUPABASE_INTEGRATION_URL`, `SUPABASE_INTEGRATION_PUBLISHABLE_KEY`, and `SUPABASE_INTEGRATION_SECRET_KEY`; it rejects non-loopback URLs and never falls back to application credentials. The verified run persisted eight sentence rows and provider-shaped responses, reused a completed repeated sentence, rejected another owner, and cleaned up its generated fixtures. Google itself was mocked in this test.

Live verification on 2026-09-08 used service-account authentication and persisted all 813 sentence analyses for an existing 560-phrase book, including 8,761 tokens. A separate read-back audit checked every book/version reference, phrase and sentence number, original-text coverage, UTF16 token offset, and dependency index; no incomplete rows remained. The metadata view passed 24 local SQL checks, and hosted privilege checks confirmed that browser roles cannot read it. These counts describe that imported version, not a general accuracy score or a billable-request count.
