# Quiet Merge Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn from complete local packages without routine notices while safely merging progress to the cloud in the background.

**Architecture:** Preserve strict IndexedDB learning commits. Add an account-scoped coalescing outbox and a silent coordinator feeding an atomic, owner-checked database merge. Keep explicit local restore and options transfer; reuse centered dialogs for actionable failures.

**Tech Stack:** Existing Node 24, Next.js 16.3.4, React, IndexedDB, Supabase/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-quiet-merge-sync-design.md`

## Global Constraints

- A network request must never gate a cycle, phrase, or local settings change.
- Automatic sync covers active learning runs, completion history, and study days.
- Learning options and preferred level remain device-local; their cloud transfer remains explicit.
- Cloud records do not automatically replace an active device's progress or options.
- Keep existing byte/count limits for stored snapshots and bound incoming batches.
- Commit, push, remote CI, deployment, hosted migrations, and issue updates remain separate actions requiring approval.
- Preserve the existing uncommitted CI fixes.
- Use Node 24. Run database integration only in a disposable local Supabase instance; keep secrets and raw application payloads out of reports.
- Do not create commits for task checkpoints; retain a local ledger and review uncommitted task diffs instead.

## Task 1: Atomic learning merge and versioned API

**Files:**
- Create `src/lib/learning-merge.ts`, `src/lib/learning-merge.test.ts`.
- Modify `src/lib/account-snapshot-repository.ts` and its tests, `src/app/api/learner/snapshot/route.ts` and `route.test.ts`.
- Create one CLI-named migration for merge validation, transaction, write permissions, and options revision.
- Modify `supabase/tests/account_snapshots.test.sql`; create `supabase/tests/learning_merge.test.sql` and a focused local concurrency integration test if SQL tests cannot express concurrency.

**Interfaces:**
```ts
type LearningMerge = {
  protocolVersion: 1; accountId: string;
  runs: SnapshotRun[]; history: SnapshotCompletion[]; studyDays: string[];
  options?: { expectedRevision: number; preferredLevel: number; settings: Partial<SessionSettings> };
};
parseLearningMerge(value: unknown, accountId: string): LearningMerge;
mergeLearning(snapshot: AccountSnapshot | null, request: LearningMerge): AccountSnapshot;
```
`mergeLearning` is a pure reference implementation of learning merge; options CAS is enforced by the database, not this pure function. Both SQL and TypeScript must use the spec's total checkpoint ordering. Export types and a safe projection helper for Task 2. Existing snapshot parser remains strict.

GET `/api/learner/snapshot` returns `{ snapshot, optionsRevision }`, with revision zero if absent. PUT accepts the versioned `LearningMerge`; successful response is `{ updated: true, optionsRevision }`. Return stable error codes for `client-update-required`, `options-conflict`, `invalid-merge`, `merge-limit`, `account-changed`, and transient `snapshot-save-failed`. Existing authorization failures stay distinguished. Never expose SQL details.

- [x] Add RED tests for union, completion domination, retry idempotence, permutation/association, grouped checkpoint coherence, and incompatible identities. Example behavioral assertion:
```ts
const older = { ...run, nextPhrase: 1, activeMs: 9000 };
const newer = { ...run, nextPhrase: 8, nextUnit: 4, activeMs: 4000 };
expect(mergeLearning(snapshotWith(older), batchWith(newer)).runs[0])
  .toMatchObject({ nextPhrase: 8, nextUnit: 4, activeMs: 9000 });
```
Build `run`, `snapshotWith`, and `batchWith` as test-local fixtures using existing default settings, valid timestamps, and fictional identities. Test exact-key rejection at all nested levels and merged limits without truncation.
- [x] Run `npm test -- src/lib/learning-merge.test.ts` and record the expected failure before implementation.
- [x] Implement parser/projection and pure merge: validate both snapshots; index by run ID; reject immutable identity conflicts; choose one coherent checkpoint/completion; maximize time; union days; canonicalize order; validate final snapshot.
- [x] Add RED DB tests for direct-write denial, owner/anonymous isolation, strict RPC validation, first-row concurrency, options CAS, malformed stored data preservation, and failure rollback. Record failures against the original schema.
- [x] Implement the database transaction with owner checks, fixed search path, qualified objects, row serialization, and revoked direct authenticated writes. Preserve existing rows. Avoid privileged browser credentials.
- [x] Add route/repository RED tests for the new request contract, legacy PUT rejection, same-origin/account fences, status classification, and acknowledgement only after commit. Implement request-bound RPC integration and safe error mapping.
- [x] Run focused unit and disposable local DB tests; read the diff for spec/quality review. Include actual red/green commands/results in the task report. No commit.

## Task 2: Durable outbox and silent coordinator

**Files:**
- Modify `src/lib/device-learning-store.ts`; extract transaction/outbox helpers into `src/lib/device-learning-outbox.ts` if needed to keep responsibilities readable.
- Create `src/lib/device-learning-sync.ts`, `src/lib/device-learning-sync.test.ts`, and durable-store behavioral tests in the existing browser test style or a real IndexedDB test environment.
- Create `src/app/device-learning-sync-provider.tsx`; integrate it through `src/app/device-access-provider.tsx` so browse, player, and offline entry points all participate.

**Interfaces:**
```ts
type LearningSyncBatch = {
  access: DeviceAccess; generation: string;
  request: LearningMerge;
  sequences: Record<string, number>;
};
captureLearningSyncBatch(access: DeviceAccess): Promise<LearningSyncBatch | null>;
acknowledgeLearningSyncBatch(batch: LearningSyncBatch): Promise<void>;
createDeviceLearningSync(access: DeviceAccess, onProblem: (code: string | null) => void):
  { flush(): Promise<void>; dispose(): void };
```
If a narrower typed problem union improves safety, publish it for Task 3. Capture includes only changed portable learning values, no `options`; `sequences` and access metadata stay local and never enter the request body. Keep `DeviceWriter` generation and local CAS semantics intact.

- [x] Add RED durable tests proving a saved run remains queued across reload, ACK cannot clear a newer edit, snapshot restore preserves unsent values, settings-only writes do not queue progress, and an outbox failure rolls back the learning write.
```ts
const sent = await captureLearningSyncBatch(access);
await saveNextCheckpoint();
await acknowledgeLearningSyncBatch(sent!);
expect((await captureLearningSyncBatch(access))!.request.runs[0].nextPhrase).toBe(2);
```
Use a real IndexedDB implementation; any transport fake must leave the store/controller real.
- [x] Run the focused test and capture RED. Add account-scoped coalescing outbox data in the same strict transaction as changed learning. Initial migration queues existing runs/history/days once. Preserve pending values through restore/recovery and enforce access/generation on capture and ACK.
- [x] Add RED coordinator tests using controlled time/transport: offline silence, reconnect upload, lost response retry, no overlapping requests, debounce starvation bound, transient versus terminal failures, logout cancellation, same-account login resume, foreign-account isolation.
- [x] Implement five-second debounce, thirty-second maximum delay, ten-second request timeout, two-to-sixty-second exponential backoff with jitter, longer Retry-After support, and focus/online wake-up. Coalesce pending values, split oversized transport batches without dropping items, and keep network work outside awaited player writes.
- [x] Integrate the coordinator under verified device access. Abort on access change/unmount; never broadcast snapshot replacement on ACK. Expose actionable terminal failures for Task 3 without emitting routine UI notifications. Provide a sync-now event/control path for explicit retries without duplicating coordinators.
- [x] Run focused store/controller tests and typecheck. Review concurrency boundaries and report red/green evidence. No commit.

## Task 3: Quiet UX, safe manual transfer, and integrated regression verification

**Files:**
- Modify `src/lib/account-snapshot-transfer.ts`, `src/app/account-snapshot-controls.tsx`, and related tests.
- Create a shared actionable dialog component/provider under `src/app/` and its behavior tests; reuse existing shadcn Dialog.
- Modify `src/app/player/local-learning-player.tsx`, `src/app/device-settings-provider.tsx`, `src/app/device-access-provider.tsx`, `src/app/device-learning-sync-provider.tsx`, `src/app/offline-shell-registration.tsx`, `src/app/offline/offline-learning.tsx`, `src/app/lesson-packages-provider.tsx`, `src/app/learner-sign-out.tsx` where active actionable errors need presentation.
- Modify `src/app/browse-shell.tsx`, `src/app/cloud-preferences-provider.tsx` and direct consumers as necessary to remove obsolete device-owned cloud selection writes without bypassing auth/catalog checks.
- Modify targeted E2E (account snapshots, offline learning, device settings/browse) and add `e2e/quiet-learning-sync.spec.ts` using existing local fixture infrastructure.
- Wire opt-in real-browser storage/coordinator tests into one existing browser-equipped job in `.github/workflows/ci.yml`; keep quality tests browser-independent and do not run remote CI.
- Update superseded spec documents with pointers to the approved replacement.

**Interfaces:** Consume Task 1's versioned GET/PUT and Task 2's coordinator and batch APIs. A shared dialog host must deduplicate a problem by account/key and avoid stacking. Explicit actions can present a fresh failure; routine retries cannot reopen dismissed background problems.

- [x] Add RED tests that successful sync produces no alert; uncertain options mutation reads back rather than blindly replaying; options conflict preserves cloud options; explicit restore still confirms and backs up locally.
```ts
await transfer.upload();
expect(transfer.state.phase).toBe("idle");
expect(transfer.state.message).toBeUndefined();
```
Adapt to the existing controller accessor while testing real state, not implementation text. The UI control is labeled `지금 동기화`. It merges progress and explicitly transfers local options with options revision CAS.
- [x] Implement manual learning merge/options CAS, safe read-back on uncertain response, no routine success message, and explicit restore/recovery confirmations.
- [x] Add RED UI/E2E assertions for centered actionable local-save errors, focus containment/return, and absent routine offline/save/sync notices. Implement a shared dialog policy; preserve the disabled state of failed local learning even if the dialog is dismissed. Keep native unload warnings native.
- [x] Remove informational offline/transfer copy. Keep in-control package progress. Retry shell preparation silently, but surface actionable offline-readiness failure at download/start when needed. Do not claim readiness from package bytes alone.
- [x] Remove legacy cloud selection/settings-write dependency from device-first browsing. Preserve readonly catalog/auth checks and usable local/cached content on transient refresh failure. Test resulting behavior, not deleted source strings.
- [x] Add integrated browser tests: installed package -> offline learning -> delayed/failed sync -> progress persisted -> reconnect -> merged cloud history without alerts. Cover all eight levels, account switch, restore, retry, and mobile/desktop actionable dialog geometry/focus. Retain package completeness, privacy and history navigation assertions.
- [x] Run unit tests, UI checks, typecheck, production build, disposable local DB integration, and focused desktop/mobile browser tests. Keep server 3000 stopped; use the isolated test server. Record actual passes/skips/failures and any physical-device limits.
- [x] Update superseded specifications, self-review, and submit the task report for independent review. No commit/push/hosted changes.

## Final review

- [x] Review the complete new diff against the approved spec and the pre-existing dirty baseline.
- [x] Verify each required behavior has test evidence; address important findings before claiming completion.
- [x] Leave a concise verified-results handoff and all changes uncommitted.
