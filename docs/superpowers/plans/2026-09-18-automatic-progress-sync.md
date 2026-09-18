# Automatic progress sync implementation plan

**Goal:** Implement #50 with automatic same-account convergence, latest safe resume,
and nondecreasing confirmed XP, without a local/cloud winner dialog.

**Architecture:** Versioned durable SQLite merge metadata projects into existing
learning tables. The account coordinator reads complete CloudKit candidates,
merges in place, and conditionally publishes with bounded retries. An active
player writes through a pinned predecessor. Native network/lifecycle triggers and
settings use this one reconciliation path.

**Tech stack:** TypeScript, Expo/React Native, SQLite, Swift/CloudKit, node:test.

**Spec:** `docs/superpowers/specs/2026-09-18-automatic-progress-sync-design.md`.

**Global constraints:** Preserve guest/account isolation and exact native asset
cleanup authority. Never commit commercial packages or private configuration.
No production deployment, device reset, or #45 work. Mixed v3/v4 writers require
updating all participating devices; physical two-device verification stays open.

## 1. Durable merge and pinned writer

- [x] Add failing real-SQLite tests in `src/core/progress-backup-merge.test.ts`
  for union algebra, unequal legacy credit, duplicate events, latest checkpoints,
  midnight, and live-player writes after remote selection.
- [x] Implement v4 codec/merge metadata in `src/core/progress-backup*.ts` and
  focused helper modules; preserve v1-v3 validation before migration.
- [x] Add `ProgressBackupStore.mergeBackup(json): void`, no-op revision stability,
  and atomic writes. Retain candidate baselines instead of summing opaque XP.
- [x] Add `Journal.createWriter(packageKey, initial, identity?)` and bind it through
  `LearningContext` / `src/app/player.tsx`; test unchanged passive persistence.
- [x] Run `npx tsx --test src/core/progress-backup*.test.ts src/core/journal.test.ts`
  and `npm run typecheck` after each behavior slice.

## 2. Account coordinator

- [x] Replace obsolete winner-choice tests with failing automatic-merge scenarios
  in `src/core/progress-sync.test.ts`; retain account/ack/cleanup race coverage.
- [x] Implement complete-candidate validation, in-place union, three CAS attempts,
  exact revision acknowledgement and durable head/abandoned intent adoption.
- [x] Implement first-enable safe recovery, manual `refresh()` while disabled,
  empty-guest consent skip, and generation checks after all async boundaries.
- [x] Implement clean foreground polling, coalesced network-return triggers,
  bounded quiet retry, inactive/dispose cancellation and no-op feedback protection.
- [x] Run `npx tsx --test src/core/progress-sync.test.ts` then typecheck.

## 3. Native lifecycle and settings

- [x] Test strict native candidate listing and network-return lifecycle where the
  existing native test seams permit; add `networkAvailable` through NWPathMonitor.
- [x] Wire listener disposal in `src/native/progress-sync.ts`; retain account guards.
- [x] Update `enable-backup`, settings component and pure UI tests to automatic
  sync / one-pass refresh, removing destructive conflict choices.
- [x] Keep live playback pinned; refresh persisted settings/selection at safe entry
  points without remounting the same account's player.
- [x] Run focused TypeScript tests, native transport tests, and typecheck.

## 4. Verification and handoff

- [x] Run `npm test`, `npm run typecheck`, build-settings and native regression
  scripts, and the available iOS bundle/build verification.
- [x] Review standards and requested behavior independently against `09a4782`;
  resolve actionable findings and rerun affected tests.
- [x] Update sanitized implementation/acceptance docs, inspect full diff and
  privacy checks, and commit scoped changes on the current branch.
- [x] Report verified local results separately from the remaining two-device,
  same-account offline/reconnect CloudKit acceptance gate. Do not close #50 yet.

## Review follow-up and remaining acceptance

Three document reviewers checked reward merging, synchronization safety, and
implementation/test requirements before implementation. Independent Standards
and Spec reviews then checked the implementation from `09a4782` and the follow-up
to `4034944`. Findings and verification are recorded in the
[review report](../reviews/2026-09-18-automatic-progress-sync.md).

- [x] Separate actual latest learning from browsing preferences and apply resume
  selection only at safe entry points.
- [x] Share canonical compressed backup encoding for local/remote equality.
- [x] Remove repeated per-unit projection and whole-history checkpoint writes;
  test atomic single-row-to-per-run SQLite migration and failure recovery.
- [ ] Complete real CloudKit offline/reconnect acceptance on two authorized
  physical devices. This is not implied by the completed local implementation.
