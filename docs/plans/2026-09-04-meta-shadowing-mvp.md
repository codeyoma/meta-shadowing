# Meta Shadowing MVP implementation plan

Spec: https://github.com/codeyoma/meta-shadowing/issues/1

## Global Constraints

- Build a Next.js App Router application in TypeScript and deploy it as an online-first PWA on Vercel.
- Use a true dark charcoal background, vivid green accent, off-white primary text, muted slate secondary text, large rounded controls, open lists, a thin progress bar, and a sticky bilingual chapter header. Do not add a mascot, gradients, fake metrics, hearts, streaks, or pronunciation scores.
- Protect learner routes with a server-validated shared password from Vercel environment configuration and a signed HTTP-only cookie lasting 30 days.
- Use Supabase Postgres for content metadata, passwordless Supabase Auth for a single administrator, and a private Supabase Storage bucket for audio. Never expose service-role or secret credentials in the browser. Enable and test RLS for every exposed table.
- Follow TDD for production behavior: write a focused failing test, observe the expected failure, implement the smallest passing behavior, then refactor while green. Test observable behavior rather than mocks or source text.
- English and Japanese are separate lessons. Preserve user-provided token spaces and segment Japanese automatically only when no spaces are provided.
- Treat lines beginning with `## ` in both text files as aligned bilingual chapter headings. Treat blank lines as unnamed section boundaries. Neither consumes a phrase index or audio number, and neither may be crossed by a phrase group.
- Map naturally sorted audio filenames with a leading three-digit sequence to ordinary phrases. Accept MP3, M4A, and WebM without transcoding.
- A completed audio playback increments a level 1-5 cycle. Require three cycles; after that Space advances and R starts at most two extra cycles. An interrupted or failed playback never increments.
- Use group sizes 2-4 in levels 4-5. A remainder at most 50 percent of the selected size joins the prior group; a larger remainder becomes a new group.
- Use WPM levels 3=200, 4=267, 5=333, and 6=400 for levels 6-8, with current-token and cumulative-token display modes.
- Store learner preferences, phrase-boundary progress, and append-only completion history in localStorage. Exclude paused/background time and reset stale progress when the lesson version changes.
- Mobile and headphones are primary; tablet and desktop remain responsive. Provide keyboard and large touch controls and keep the screen awake when supported.

## Task 1: Protected PWA learner shell (GitHub #2)

Build the first runnable vertical slice: a learner enters the shared beta password, chooses English or Japanese, selects a sample lesson and any of eight levels, configures a session, and reaches the player shell.

Acceptance criteria:

- Successful server-side password verification issues a signed, HTTP-only 30-day cookie; failure reveals no learner content.
- The flow is language -> lesson -> one of eight unlocked levels -> session setup -> player shell.
- A last local selection can be resumed from the home screen.
- Mobile and desktop layouts follow the approved dark/green visual system with large touch controls.
- The application exposes a valid installable online-first PWA manifest.
- Browser-level tests cover password entry through session setup; focused unit tests cover any new cookie or local-preference behavior.

## Task 2: Administrator imports and validates a text lesson draft (GitHub #3)

Add the administrator vertical slice from restricted passwordless login through uploading target and Korean UTF-8 files, parsing their aligned structure, persisting a draft, and previewing validation results.

Acceptance criteria:

- Only an existing configured administrator can authenticate; sign-in does not auto-create users.
- Ordinary lines align as bilingual phrases, aligned `## ` lines become bilingual chapter headings, and blank lines become unnamed section boundaries.
- Mismatched phrase counts, chapter positions, or empty phrases produce actionable validation errors and cannot reach publish-ready state.
- The preview shows the parsed order without inline editing.
- Tables and routes apply both RLS and server-side authorization.
- Pure parser tests and an administrator browser flow cover success and representative failures.

## Task 3: Attach private sentence audio and publish a lesson (GitHub #4)

Let the administrator upload numbered audio for a validated draft, reject incomplete packages, publish the complete lesson, and let an authorized learner list it and play the first private audio.

Acceptance criteria:

- Natural-sort numbered MP3, M4A, and WebM files and map them only to ordinary phrases.
- Reject missing, duplicate, invalidly numbered, or unsupported audio.
- Store audio in private Supabase Storage and authorize uploads only for the administrator.
- Give a password-authorized learner short-lived playback access without revealing a permanent public URL.
- Only published lessons appear in the learner catalog.
- Integration tests cover storage policy, publish behavior, and first playback.

## Task 4: Complete level 1 three-plus-two cycle learning (GitHub #5)

Make level 1 fully usable against a published lesson with manual and automatic playback, required and extra cycles, shortcuts, touch controls, speed control, and recoverable audio failures.

Acceptance criteria:

- Only completed playback increments a required or extra cycle.
- Required cycles 1-2: idle Space or R starts the next required playback.
- After required cycle 3: Space advances and R starts extra cycle 1; after extra 1 R starts extra 2; after extra 2 Space or R advances.
- During playback Space pauses/resumes and R restarts without counting the abandoned attempt.
- Automatic mode uses the configured speaking window and post-cycle countdown; R cancels advancement for an extra cycle.
- Playback speed runs 0.5x-3x in 0.25 increments.
- Playback failure stops without incrementing and offers retry.
- Transition tests and browser keyboard/touch tests cover the workflow.

## Task 5: Add level 2 and 3 memory and subtitle-hint learning (GitHub #6)

Extend the session with level 2's two-speaking window and level 3's bilingual first-token hint and reveal behavior.

Acceptance criteria:

- Level 2 shows full target and Korean text and uses audio duration x 2.25 plus 0.75 seconds.
- Level 3 shows only the first target and Korean token until S or the subtitle button reveals both full texts.
- Reveal resets to first-token state on the next cycle or phrase.
- Japanese uses supplied spaces first and automatic segmentation only for unspaced input.
- The shared three-plus-two cycle behavior remains unchanged.
- Tests cover timing, tokenization, reveal, and reset behavior.

## Task 6: Add chapter-bounded group learning for levels 4 and 5 (GitHub #7)

Support groups of 2-4 phrases, chapter and unnamed-section boundaries, sequential group audio, current-line emphasis, and level 5 bilingual hints.

Acceptance criteria:

- The learner selects group size 2, 3, or 4.
- Remainders at most 50 percent join the previous group and larger remainders become a new group, independently inside each boundary.
- Level 4 shows full bilingual group text and highlights the playing line.
- Level 5 shows each phrase's first bilingual token and S reveals the full group until reset.
- Default internal audio gap is 0.5 seconds and completion of the entire sequence counts as one cycle.
- The current bilingual chapter title stays pinned; unnamed boundaries render as a divider.
- Tests cover every remainder threshold, boundary isolation, group audio, and hint state.

## Task 7: Add WPM learning for levels 6, 7, and 8 (GitHub #8)

Implement the audio-free rapid-speaking engine with four WPM levels, current/cumulative display, the three language orders, manual line stops, automatic continuation, and navigation controls.

Acceptance criteria:

- WPM levels map exactly to 200, 267, 333, and 400.
- Level 6 runs target then Korean; level 7 runs Korean, speaking window, then target; level 8 runs Korean and speaking window only.
- Manual mode automatically runs a full line and stops at the line boundary; automatic mode continues after configured gaps.
- Space pauses/resumes when running and advances when idle; arrows navigate lines; R restarts the current line.
- Supplied spaces and Japanese fallback segmentation determine tokens.
- Tests cover schedule order, timing, pause, restart, manual stop, and display modes.

Timing clarification approved on 2026-09-06: for levels 7–8, the speaking window is the target line's token count × 60,000 / selected WPM, plus an adjustable extra pause (default 500 ms). The Korean prompt's length does not determine this window. Automatic line gaps default to 1,000 ms; chapter/blank-section gaps default to 2,000 ms and replace the ordinary line gap.

## Task 8: Connect settings, progress, and completion history (GitHub #9)

Let learners override global defaults, persist browser preferences and phrase-boundary progress, resume the last session, and append completion records with active time and the configuration snapshot.

Acceptance criteria:

- Expose stage-appropriate basic settings and advanced timing settings.
- Learner overrides persist locally and become the browser's next defaults.
- Save progress only after a phrase or group completes and resume it from home.
- Append completion date, active duration, lesson version, level, and settings for every completed run.
- Exclude paused and background time.
- Show completion progress, date, and level duration.
- Browser tests cover local persistence, resume, repeated completions, and active-time accounting.

Implementation notes for #9:

- `/admin/settings` edits a single RLS-protected `session_defaults` row. Apply `20260906072641_session_defaults.sql` alongside the earlier migrations before using a configured Supabase deployment. Nothing in this ticket deploys or modifies hosted data.
- Untouched settings inherit administrator defaults; explicit learner overrides persist browser-wide. Group size is chosen before a run so it cannot remap a partially practiced group.
- An audio phrase/group commits when the learner advances after the required cycles (or the automatic countdown ends). Rapid lines commit when their full sequence ends. Resume starts the next committed unit with fresh cycles/tokens; abandoned partial-unit time is not carried into the resumed run.
- Active audio time includes manual speaking after playback, but excludes loading, errors, settings pauses, explicit pauses, and background time. Rapid timing counts consumed playback/speaking/gap time and excludes manual between-line waits. No time is counted before starting.
- The existing publication timestamp is the lesson's version identifier until #10 supplies its content-version lifecycle. History keeps this identifier and the final settings snapshot; a run ID prevents refreshes from duplicating a completion. Starting again from setup creates a distinct run.
- Local records contain metadata and settings, never recordings or full lesson transcripts. Unavailable/full browser storage leaves practice usable and displays a warning if a completion could not be saved.

## Task 9: Support lesson versions, unpublish, and permanent deletion (GitHub #10)

Let the administrator replace published content with a new version, unpublish it, or permanently delete its rows and audio, while learners safely discard stale local progress.

Acceptance criteria:

- Replacing published content creates a new version.
- A version mismatch resets local progress with a clear learner message.
- Unpublished lessons leave the learner catalog without deleting stored data.
- Confirmed permanent deletion removes lesson data and associated Storage objects.
- Partial deletion reports a recoverable administrator error.
- Integration tests cover invalidation, unpublish authorization, and cleanup.

## Task 10: Harden the mobile PWA and verify Vercel release (GitHub #11)

Bring the full eight-level service to release quality across mobile, tablet, and desktop, verify security and accessibility, compare the implementation with the accepted visual concepts, and document production deployment.

Acceptance criteria:

- Wake Lock works when available and fails gracefully when unavailable.
- Keyboard focus, touch targets, contrast, reduced motion, and responsive layouts meet the release bar.
- Current and next audio preload without breaking recoverable network failure behavior.
- Supabase grants, RLS, administrator app metadata, private Storage, and signed playback are verified.
- Critical browser flows pass at mobile and desktop sizes.
- Native-size screenshots match the accepted concepts for copy, hierarchy, typography, palette, spacing, and control states.
- Production build, tests, environment configuration, and Vercel deployment instructions pass verification.
