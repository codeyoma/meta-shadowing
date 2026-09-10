# Ticket 30: all-level device learning cutover

Binding scope: issue #30 and `docs/superpowers/specs/2026-09-09-device-first-learning.md`.
The all-level durable store foundation is implemented and reviewed already; preserve it.

## Global constraints

- No commit, push, merge, deployment, or hosted database changes.
- Packages are mandatory; no streaming fallback, playback leases or automatic cloud uploads.
- Preserve account isolation, strict validation, immutable completed history and durable local writes.
- Local-save failure blocks the next phrase with retry; network failure does not block installed learning.
- Existing manual/automatic audio and rapid semantics remain; only recording authority changes.
- Read installed Next.js guides before changing framework integration.
- Use public browser/player and storage interfaces for tests; real disposable local data only.
- Browser emulation is not real-device acceptance. Keep secrets and local paths out of tracked artifacts.

## Task 1: Connect all player modes to the local adapter

Files: local-learning-player.tsx, package-learning-player.tsx, recording-types.ts,
audio/rapid session integration where necessary, and new device-all-levels.spec.ts.

1. RED: installed-package level 2 advances and reloads with local progress while
   progress/lease/preferences HTTP is blocked. Extend the existing device-learning
   browser fixture pattern; do not mock the store or replace playback state machines.
2. Generalize local adapter to stage-derived levels 1–8. Use pinned package hints,
   grouped phrases and rapid lines; preserve per-run settings, group sizes, gaps,
   confirmed cycles, rapid indexes and completion identities.
3. Wrap every level in local account access and package gates. Route every level
   through local adapter, with no CloudLearningPlayer acquisition. Rename shared
   recording contract to neutral terminology, retaining old server adapter only
   where still required by legacy code/server API tests.
4. Add public tests for every level, manual/automatic transition semantics, grouped
   boundaries, pause/resume, reload, local-write failure and recovery for audio and
   rapid modes. Confirm no checkpoint/renew/remote audio calls after installation.
5. Package dictionary and syntax must remain offline; test the user-facing popups.
6. Run focused production browser tests desktop/mobile, unit tests, typecheck and
   UI checks. Restore only generated next-env/tsconfig diffs. Report exact RED/GREEN.

## Task 2: Offline navigation and device-owned journal

Files: offline/offline-learning.tsx, use-device-journal.ts, next-practice and browse
consumers as needed; relevant device-learning/navigation E2Es and fixtures.

1. RED: cold offline reload at a non-level-1 stage restores that level and progress;
   use installed shell and public navigation, never authenticated HTML caching.
2. Offer all sixteen stages from downloaded lesson inventory. Preserve selected
   stage/run, pinned version, account/package revocation fencing and media identity
   during ordinary focus refresh. Support switching installed lessons offline.
3. Device journal is authoritative for all levels, per-lesson runs/history/study-day
   projection. Never import legacy cloud progress or let it override local resumes.
4. Verify two lessons retain independent checkpoints, completion deduplication,
   local settings, old-version history, reload/reconnect and no implicit upload.
5. Migrate tests requiring old server-run acquisition/takeover only where learner UI
   behavior changed; retain server authorization/API tests. Do not weaken privacy
   assertions, remove genuine coverage, or increase timeouts to hide failures.

## Task 3: Integrated regression and review

1. Run all relevant device/package/navigation/player browser suites against a
   disposable local Supabase stack serially, desktop/mobile. Classify old-contract
   failures and replace their assertions with device-first outcomes.
2. Run unit suite, UI checks, typecheck and isolated production build. Use Node 24.
3. Review full uncommitted diff for account isolation, durability, update/reconnect
   behavior and test coverage. Fix findings and rerun covering tests.
4. Report acceptance evidence per #30 criterion, remaining limitations and local
   verification results; do not close #30 if required behavior remains unverified.
