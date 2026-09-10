# Ticket 30: initial durable-record slice

This starts #30; it does not complete the all-level player cutover. The binding
specification is issue #26 and `docs/superpowers/specs/2026-09-09-device-first-learning.md`.

## Global constraints

- No commit, push, merge, deployment, or hosted database changes.
- Preserve existing level-1 behavior and account isolation.
- Use the public storage interface and real browser IndexedDB in tests.
- Do not switch player routes until all-level playback is separately verified.
- Keep credentials, account data, and local paths out of tracked reports.

## Task 1: Extend the durable run model to all levels

Modify `src/lib/device-learning-store.ts` and add focused browser tests in
`e2e/device-run-storage.spec.ts` using the existing cloud-ui fixture and dynamic
browser-side public store import pattern in device-learning.spec.ts.

- Write a failing test at public startDeviceRun/saveDeviceRun/readDeviceLearningRecord
  boundaries, then implement support for stages 1–16 and their mapped levels 1–8.
- Inspect existing level/stage and grouped/rapid progress types before choosing
  validation. Retain nonnegative safe integer checks, settings validation,
  stage/level consistency, and confirmed-cycle bounds; rapid modes have no audio
  confirmations. Do not assume grouped or rapid unit indexes equal phrase indexes.
- Preserve schema-1 settings and schema-2 level-1 data compatibility. Do not import
  server progress or clear existing local history. Document version decision.
- Verify independent runs for two lessons and different stages, per-run revision
  fencing, reload persistence, deduplicated completion, invalid-stage rejection,
  and invalid level/stage or cycle data rejection without changing prior data.
- Verify local settings changes preserve runs/history and retained run settings.
- Keep this slice storage-only: no player, offline-shell or catalog cutover.
- Run focused browser tests on desktop/mobile, unit suite, and typecheck.
- Self-review and report exact red/green evidence; leave changes uncommitted.

## Remaining ticket scope

Player adapters, grouped and rapid runtime cutover, local journal/navigation,
offline stage selection, all-level playback/reload/write-failure E2E migration,
and independent privacy/behavior review remain required before closing #30.
