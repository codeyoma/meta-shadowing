# Account Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Explicit, account-isolated cloud upload/download with atomic local recovery.

**Architecture:** Portable validated records cross authenticated GET/PUT APIs into one owner-scoped table. IndexedDB owns active data, backup, and durable generation fencing. Settings invoke transfers explicitly.

**Tech Stack:** TypeScript, Next.js, React, IndexedDB, Supabase Postgres/RLS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-account-snapshots.md`

## Global Constraints

- Initial implementation was local-only. After acceptance, the user separately authorized ticket closure and a feature PR into `dev`; no merge, deployment, or hosted database changes.
- No automatic upload on learning, login, reload, or reconnect.
- Account switching cancels transfers and fences response handling and local mutations.
- 2 MiB UTF-8 JSON; 2,000 active runs; 10,000 completions; 36,600 unique study days; 128-character identifiers.
- Preserve all existing privacy assertions and local durability behavior.
- Use Node 24, existing isolated worktree, disposable local Supabase, and an isolated production-test port. Preserve the user's port 3000 server.
- Run focused RED/GREEN tests per task. Do not silently skip failed coverage.

## Task 1: Portable snapshot contract

**Files:** Create `src/lib/account-snapshot.ts`, `src/lib/account-snapshot.test.ts`.

**Interfaces:** Export `AccountSnapshot`, `SnapshotError`, `parseAccountSnapshot(value: unknown, accountId: string): AccountSnapshot`, `exportAccountSnapshot(record: DeviceLearningRecord): AccountSnapshot`, `snapshotHasContent(snapshot: AccountSnapshot): boolean`, and `SNAPSHOT_MAX_BYTES`.

- [x] Write a failing round-trip/projection test using a literal local record with all eight levels and history. Add extra sentinel credentials and revision fields to the input. Assert parsed portable records preserve confirmed checkpoints and exclude sentinels/revisions.
  ```ts
  expect(JSON.stringify(exportAccountSnapshot(record))).not.toContain("PRIVATE_SENTINEL");
  expect(() => parseAccountSnapshot(snapshot, "another-account")).toThrow();
  ```
- [x] Run `npm test -- src/lib/account-snapshot.test.ts` on Node 24 and record RED.
- [x] Implement explicit field projection and strict parsing. Portable runs retain the existing ProgressRecord fields plus confirmedCycles and optional completedAt, but omit revision. Require history completion dates and forbid completed active runs. Reject duplicate run IDs across arrays. Accept only known languages/settings, compatible stage/level, valid timestamps, safe counters, and the spec bounds. Deep-project nested settings. Reject non-JSON/unknown fields and oversized serialized data with stable safe errors.
- [x] Add parameterized negative cases for each validation boundary; assert all-empty/default versus settings-only content detection. Execute GREEN. Do not introduce HTTP/DB/UI behavior in this task.
- [x] Self-review and write a report including exact RED/GREEN evidence; leave changes uncommitted for independent review.

## Task 2: Atomic local replacement and generation fencing

**Files:** Modify `src/lib/device-learning-store.ts` and its caller surfaces in `src/app/device-settings-provider.tsx`, `src/app/player/local-learning-player.tsx` as required; create `e2e/account-snapshot-storage.spec.ts`; extend `e2e/fixtures/package-store.ts` only for test-module access.

**Interfaces:** Consume Task 1. Export `replaceDeviceSnapshot(access: DeviceAccess, snapshot: AccountSnapshot, signal?: AbortSignal): Promise<void>`, `recoverDeviceSnapshot(access: DeviceAccess, signal?: AbortSignal): Promise<void>`, and `hasDeviceSnapshotBackup(access: DeviceAccess): Promise<boolean>`. Reread with `readDeviceLearningState(access)` after a committed change; recovery may restore absence. Every local writer uses the returned `DeviceWriter`, including its durable generation. Optional signals fence cancellation inside the replacement/recovery transaction.

- [x] Write browser RED: save local A, replace with validated B, read B, recover A, recover B. Use real IndexedDB and the existing signed-in test fixture. Assert package inventory remains unchanged.
- [x] Add a durable generation token to account records and capture it at writer initialization. Legacy records normalize to an initial generation. Every mutation checks its captured generation inside the same readwrite transaction; replacement/recovery assigns a fresh token. Returned runs/settings writer contexts carry the local token, never portable snapshots. Include active players, settings providers, delayed start calls, and other tabs.
- [x] Store recovery data atomically with active data in the existing database (upgrade carefully if a separate store is used). Preserve a backup of absence as distinct from no backup. Broadcast post-commit changes without personal data. Close connections on versionchange.
- [x] Write RED/GREEN for aborted replacement preserving both records, absent/malformed/empty rejection, A/B denial, stale checkpoint/settings writes after restore and recovery, and same-account logout/login fencing. Concrete contract:
  ```ts
  await expect(saveDeviceRun(oldWriter, oldRun, oldRun.revision)).rejects.toThrow();
  expect((await readDeviceLearningRecord(access.accountId))?.runs[0].nextPhrase).toBe(4);
  ```
- [x] Run focused production browser tests using the existing local integration runner, desktop/mobile, one worker. Self-review/report; no commit.

## Task 3: Authenticated snapshot persistence

**Files:** Create `src/lib/account-snapshot-repository.ts`, `src/app/api/learner/snapshot/route.ts`, route tests, a timestamped migration under `supabase/migrations/`, and `supabase/tests/account_snapshots.test.sql`.

**Interfaces:** GET returns `{ snapshot: AccountSnapshot | null }`; PUT takes AccountSnapshot and returns `{ updated: true }`. Repository exposes `readAccountSnapshot(accountId)` and `writeAccountSnapshot(accountId, snapshot)` using authenticated request-bound Supabase client, never body-derived authority.

- [x] Write RED HTTP tests for unauthenticated, foreign-origin, cross-account, malformed, unknown schema, wrong content type, oversized streamed body, and duplicate unconditional PUT replacement.
- [x] Add owner-only RLS SELECT/INSERT/UPDATE table with primary key account ID, validated version, JSON and update time. Test authenticated A cannot read/write B, anonymous denied, second own upload replaces first regardless age. Use local migrations only.
- [x] Authenticate through existing server learner boundary. Limit bytes during streaming; revalidate database reads and return safe errors, private/no-store. Map missing snapshot to null, corrupt snapshot to 503. Upsert atomically without revision comparison. Do not wire requests to existing automatic preferences APIs.
  ```ts
  expect((await PUT(foreignAccountRequest)).status).toBe(409);
  expect((await PUT(oversizedRequest)).status).toBe(413);
  ```
- [x] Run focused route unit tests and disposable local pgTAP. Report RED/GREEN and authentication-client compatibility; no hosted writes or commits.

## Task 4: Explicit transfer controls and acceptance

**Files:** Create `src/lib/account-snapshot-transfer.ts`, `src/app/account-snapshot-controls.tsx`, `e2e/account-snapshot-transfer.spec.ts`; modify the existing settings surface to mount controls.

**Interfaces:** Consume Tasks 1–3. Controller takes captured DeviceAccess and AbortSignal; UI owns request lifetime, confirmation and retry. Explicit user retry creates a new request, never a persistent queue.

- [x] Write RED through settings: upload A; alter local data; download, cancel, verify unchanged; confirm, verify replacement; recover previous data. Authenticate through real disposable integration. Assert no package grant/installation appears from restored progress.
- [x] Implement explicit buttons with shared shadcn primitives. Download validation precedes confirmation and transaction. Empty cloud shows explanation, never destructive reset. Recovery confirmation and backup availability are local. Show busy/error/result state in controls; no automatic-save toast.
- [x] Hold transfer responses, switch account/logout/unmount, release responses and prove no mutation or retry under the new identity. Abort in-flight requests and recheck account epoch before committing. Do not promise abort rolls back a completed remote write.
- [x] Add absence-of-request assertions across learning, reconnect, reload, and login. Add user cancellation and malformed-response tests. Keep known unsafe payloads synthetic and out of public artifacts.
- [x] Run all new E2E desktop/mobile plus device-offline-navigation/device-run-storage regressions; run full unit suite, UI check, production build, typecheck and local DB tests. Record exact commands/counts and any skipped coverage.
- [x] Independent task and final review; fix findings with covering tests. Leave branch uncommitted and #31 open until all acceptance is verified and the user requests publication.

## Acceptance and publication handoff

- All seven criteria in #31 passed; the ticket was closed as locally verified.
- 601 unit/integration tests passed with the optional local integration enabled;
  all 153 database assertions passed. Build, typecheck, and shared UI checks passed.
- A broad desktop/mobile run exposed fixture initialization races. Account-specific
  readiness waits fixed them without weakening assertions or changing production
  logic. The targeted 80-case rerun passed; another 80 cases had passed in the broad
  run, covering 160 distinct cases overall.
- Added `e2e/account-snapshot-auth.spec.ts` for real HTTP authentication, two-account
  isolation, and unconditional replacement. Independent review has no remaining
  findings.
- Publication is now user-authorized. Remote CI and deployed/physical-device checks
  are separate from these local results; no hosted migration was applied.
