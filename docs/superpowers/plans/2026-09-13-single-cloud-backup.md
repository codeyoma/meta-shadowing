# Single Cloud Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** One maintained account backup with safe continuation and explicit divergent-history resolution.

**Architecture:** Immutable asset followed by conditional shared-head replacement. Persist an opaque adopted cloud token in the account profile mapping; restore into an inactive SQLite profile and atomically select it. Legacy migration is explicit when contents disagree.

**Tech Stack:** Existing Expo/TypeScript, expo-sqlite, Swift, CKSyncEngine, node:test and Swift Testing.

**Spec:** `docs/superpowers/specs/2026-09-13-single-cloud-backup-design.md` (owner approved written spec).

## Global Constraints

- iPhone first, iOS 26+; Android remains deferred.
- No Supabase, public database, backend, dependency change, or purchase-ownership migration.
- Preserve guest/account isolation, original completion identities, recorded XP, daily eligibility, unfinished checkpoints, and preferences.
- Learning remains local-first and never waits for a cloud acknowledgement.
- Do not change playback semantics or start audio during profile replacement.
- Routine success is quiet; conflicts and failed recovery are actionable.
- No commit, push, issue mutation, production deployment, or app uninstall is authorized.
- Preserve unrelated worktree changes and the existing CloudKit sign-in fix.

## Shared bridge contract

```ts
type CloudBackup = {
  id: string; createdAt: string; revision: number;
  token: string; legacy: boolean; cleanupPending?: boolean; pendingPublication?: string;
};
type CloudPublication = CloudBackup & { cleanupPending: boolean };
// A successful list with no backups has the empty-string token.
publish(scope: string, revision: number, json: string, base: string): Promise<CloudPublication>;
cleanup(scope: string, base: string, abandoned: string | null): Promise<boolean>;
```

Singleton token is its immutable current asset identity. Legacy candidates all
carry one deterministic token covering the full fetched legacy-head state, not a
date-based winner. Tokens are private bridge values, never user-facing labels.
`read(scope,id)` must refetch and reject a superseded singleton identity.
`pendingPublication` is an opaque native intent identity captured on adoption;
it is not inferred from the current local revision. Persist it atomically with
the account base/profile. `cleanup` CAS-adds only that displaced pending asset to
the shared manifest, then retires native pending and retries exact cleanup. It
returns whether cleanup remains pending without creating a new progress version.

### Task 1: Conditional native singleton transport and bridge

**Files:** `modules/progress-cloud/ios/{ProgressStore,ProgressTransport,CloudKitService,ProgressCloudModule}.swift`, `modules/progress-cloud/index.ts`, native tests under `tests/cloudkit/Tests/`.

**Interfaces:** Consume existing account-scoped `ProgressCloudService`. Produce the shared bridge contract above; keep account/list/read/stop entry points.

- [x] Write failing native behavioral tests at the existing external cloud seam. Removing base comparison must fail the stale-device test; retaining previous generations must fail the singleton-retention test.

```swift
let first = try await deviceA.publish(scope: scope, revision: 1, json: firstJSON, base: "")
let second = try await deviceB.publish(scope: scope, revision: 1, json: secondJSON, base: first.token)
#expect(try await deviceA.list(scope: scope).map(\.id) == [second.id])
await #expect(throws: ProgressCloudError.conflict) {
  try await deviceA.publish(scope: scope, revision: 2, json: thirdJSON, base: first.token)
}
```

- [x] Run focused native tests and capture the expected RED evidence before implementation.
- [x] Implement singleton validation, opaque legacy token, exact base comparison plus CloudKit change-tag CAS, durable pending publication/retry, matching ack and cleanup state. Use the existing immutable-asset-first protocol:

```swift
guard fetchedToken == base else { throw ProgressCloudError.conflict }
// Persist expected base before delivery; never replace it after a retry fetch.
// Save immutable bytes; confirm them; CAS the shared head; persist ack/cleanup.
```

Reject stale durable pending work; allow an explicit fresh publication after its
conflict without silently resuming/rebasing the old payload. Recover an already
committed identical pending publication. Cleanup must not turn an acknowledged
publication into a false unacknowledged result; return cleanupPending instead.
Cleanup exact superseded assets and legacy heads only after confirmed migration;
recheck remote state and guard concurrent mutation during retirement. If old-client
concurrency cannot be made safe, preserve divergent data and report cleanupPending,
not a claimed singleton. Never delete unrelated records or referenced assets.

- [x] Add RED/GREEN cases for two-writer head race, crash retry, pending conflict recovery, cleanup failure, legacy migration, changed legacy head, corrupt singleton, and stale account. Keep existing safety coverage; update tests whose intentional retention contract changed.
- [x] Run native suite through the existing generated Xcode test project; inspect xcresult actual test count. Self-review and report exact files/results. Do not commit or change live cloud data.

### Task 2: Persistent reconciliation and conflict coordinator

**Files:** `src/core/progress-sync.ts`, new focused `src/core/progress-profiles.ts` if extraction is needed, `src/core/progress-sync.test.ts`, `src/native/progress-sync.ts` only if lifecycle integration requires changes. Narrow native bridge addition: expose optional list cleanupPending from fetched authority, with native regression, to avoid unnecessary clean publications.

**Interfaces:** Consume Task 1 bridge. Produce `SyncSnapshot.conflict` with an opaque choice token, cloud candidates, captured local revision and cleanup status; `resolveConflict(choice:'cloud'|'local', token:string, backupID?:string):Promise<void>`.

- [x] Add real SQLite failing tests for clean remote adoption, both-dirty conflict, chosen cloud/local resolution, stale confirmation and delayed-read local edit. The following observable expectations bind the implementation:

```ts
await sync.refreshAccount();
assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":2}');
assert.equal(profiles.current().pending(), false);
// Both dirty: neither local profile nor remote payload changes before selection.
assert.ok(sync.getSnapshot().conflict);
```

- [x] Run `npx tsx --test src/core/progress-sync.test.ts` and observe RED.
- [x] Persist cloud token alongside account mapping with schema migration preserving old rows. Make mapping/base activation atomic; native publication ack and local revision ack need crash-safe ordering (persist base before acknowledging revision, recognize identical content on restart).
- [x] Reconcile enabled accounts after successful fetch, even without pending edits. Compare base and fetched token; use canonical equality only to establish unknown legacy provenance, never timestamps. Save/guard then recheck before activating an inactive restored profile. A changed revision during read/checkpoint becomes conflict. Disabled accounts never adopt automatically.
- [x] Implement confirmation-scoped resolution. Re-fetch token and recheck captured profile/revision/account. Local replacement publishes with the displayed base; cloud choice restores validated data without XP actions. If either side changes, invalidate the choice. Preserve guest and displaced local profiles.
- [x] Add restart-base persistence, failed mapping commit, nonempty reward restoration, backup-disabled, account-switch, timer/coalescing and cleanup-status tests. Update cloud test doubles to fully model the new bridge. Run focused tests/typecheck then full `npm run check`; report RED/GREEN and self-review, no commit.

### Task 3: Recovery UI, integrated verification and docs

**Files:** `src/components/icloud-backup.tsx`, a focused pure UI-model module and tests if needed, `docs/cloudkit-progress.md`.

**Interfaces:** Consume Task 2 snapshot/resolveConflict; no native retention policy in UI.

- [x] Add failing behavioral UI-model tests for one singleton restore action, legacy migration choices, conflict confirmation actions and unavailable states. Use actual snapshot fixtures, not source-text checks.
- [x] Render `백업 복구` plus Korean last saved date/time; only legacy migration can expose multiple choices. Conflict actions are `클라우드 기록 이어받기` and `이 기기 기록으로 백업 교체`; both use native confirmation with explicit displaced-history wording and captured choice token.
- [x] Remove obsolete previous-version fallback copy. Show actionable cleanup-pending status, without claiming cloud has already reached singleton retention.
- [x] Run all TypeScript checks, native tests and signed development build, preserving current iOS workspace. Do not prebuild, uninstall, install or launch a migration-enabled physical build without separately confirming live-record retirement safety.
- [x] Record measured results and remaining real-service/two-device gates in docs; review the task diff and run `git diff --check`. No commit/push or ticket closure.

## Execution ledger

Track task review outcomes in the plan-specific ignored SDD workspace. Existing
uncommitted baseline work must be preserved and distinguished in review packages;
repository policy overrides skill-template commit steps. Run task reviews followed
by a final integrated review, fixing safety findings before calling work complete.
