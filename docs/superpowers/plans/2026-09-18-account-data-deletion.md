# Account Data Deletion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development task-by-task. Steps use checkboxes; repository restrictions override skill commit defaults.

**Goal:** Safely isolate changing accounts and delete current-profile learning data without stale devices resurrecting it.

**Architecture:** Native conditional CloudKit heads carry a reset generation. A v5 envelope wraps the existing validated v4 learning backup. Durable account-scoped intents coordinate SQLite resets, native cache retirement and confirmed cloud cleanup; settings expose three distinct deletion scopes.

**Tech Stack:** TypeScript, React Native/Expo, SQLite, Swift/CloudKit, node:test and native fixtures.

**Spec:** `docs/superpowers/specs/2026-09-18-account-data-deletion-design.md`

## Global Constraints

- Keep package files, progress identity and StoreKit ownership separate.
- Use the current SQLite and CloudKit boundaries; no new backend or Supabase.
- Never perform destructive acceptance against the owner's actual learning data.
- Two-device real CloudKit acceptance remains deferred, not silently passed.
- No commit, push, PR, deployment or real cloud deletion without a corresponding user request.
- All participating installations must update before cloud deletion is supported.
- Work on `codex/51-account-data-deletion`, based on dev `7c4ff52`.

## Task 1: Native reset generations and precise local cache removal

**Files:** Modify `modules/progress-cloud/index.ts`, `modules/progress-cloud/ios/{ProgressStore,ProgressTransport,CloudKitService,ProgressCloudModule,ProgressCloudOwner}.swift`; add native tests under `tests/cloudkit/Tests/` and update its project configuration only if necessary.

**Interfaces:** Extend `CloudBackup`/`CloudPublication` with optional `resetGeneration?: string` (absent means pre-reset legacy generation). Add required native bridge methods:

```typescript
reset(scope: string, requestId: string, expectedGeneration: string, json: string): Promise<CloudPublication>;
discardLocal(scope: string): Promise<void>;
```

Wire format for nonlegacy progress:

```json
{"version":5,"generation":"request-uuid","progress":{"version":4,"tables":{},"sync":{"clocks":{},"runs":[]}}}
```

The example's tables must contain the full existing v4 schema in actual payloads. Native validation checks the bounded envelope and generation; the shared codec remains authority for learning contents. The empty-string generation is reserved for legacy pre-reset data. Actual reset request IDs must be UUIDs. Head and asset generations must match; every normal publication must match the fetched authoritative generation. Older version payloads cannot overwrite a reset generation.

- [x] Add failing native fixture tests: reset fences queued old publication, retries/lost reply do not reset again, subsequent learning in the same generation survives reset retry, concurrent reset from the same expected generation adopts the winner, cleanup failures report pending.
- [x] Run focused native tests and observe feature-missing failures before production changes.
- [x] Implement CAS reset using existing transport/cleanup mechanisms. Include superseded app-owned payloads in exact cleanup authority; retain only minimal boundary metadata. Validate all before staging/publishing; fetch/account checks after awaits.
- [x] Add tests for offline local cache removal: no cloud request, only the supplied account cache affected, late callbacks cannot recreate retired local state. Implement `discardLocal` with native cancellation and exact owned paths, preserving unrelated profiles and files.
- [x] Preserve current migration/read/cleanup behavior and add regression tests for envelope/head mismatch and legacy payload rejection after reset.
- [x] Run native fixture suite. Generate review diff/report without committing. Task review must approve both spec compliance and code quality before Task 2.

## Task 2: Durable core reset coordination and account privacy

**Files:** Modify `src/core/progress-sync.ts`, `progress-backup.ts`, `journal.ts`, `src/native/progress-sync.ts`, `src/components/progress-profile.tsx`; create `src/core/progress-deletion.ts`, `progress-envelope.ts` and tests, plus focused core helpers if needed.

**Interfaces:** Consume Task 1 native methods and resetGeneration. Expose:

```typescript
// On ProgressSync, with stale confirmation generation protection:
accountChanged(): Promise<void>;
removeLocal(generation?: number): Promise<void>;
deleteCloud(generation?: number): Promise<void>;
retryDeletion(): Promise<void>;
// Snapshot adds deletion status suitable for settings and player gating.
```

- [x] Add failing real-SQLite tests for immediate privacy hiding on account notification, unavailable identity, A→B→A, late responses, failed checkpoint, ordinary offline learning retained.
- [x] Implement explicit account-notification invalidation separately from routine foreground refresh. Wire native event to `accountChanged`; never silently import guest or cross-account data.
- [x] Add failing tests for current-profile-only local wipe, guest fallback clearing, durable wipe retry on startup, settings/revision reset, old pinned writer rejection and other profiles preserved.
- [x] Implement durable wipe intent outside erased tables. Invalidate mounted learning authority before clearing rows. Retire native cached publication payloads before reporting completion. Leave automatic sync off.
- [x] Add failing v5 envelope tests and two-installation reset tests: inspect generation before merging, discard stale old-generation writes, lost replies, partial cleanup, concurrent deletion, offline pending, switching accounts mid-delete and relaunch retry.
- [x] Implement bounded idempotent deletion retries using the saved UUID/expected generation. Never promote malformed/absent cloud data into deletion authority. Persist generation atomically with local reset; no learning while accepted destructive intent is unresolved.
- [x] Run `npx tsx --test src/core/progress-envelope.test.ts src/core/progress-sync.test.ts src/core/progress-backup*.test.ts` and `npm run typecheck`. Review the task diff/report before UI integration.

## Task 3: Settings controls, full verification and handoff

**Files:** Modify settings routes/components under `src/app/(tabs)/settings/` and `src/components/`; create pure deletion-confirmation helper/tests in `src/core/`; update `docs/cloudkit-progress.md` and the plan checklist.

**Interfaces:** Consume Task 2 generation-scoped actions/status. Keep existing package-removal control and StoreKit ownership paths unchanged.

- [x] Add failing confirmation-helper tests for cancelled/stale confirmation, guest-only local removal, offline cloud-delete pending, confirmed completion and retryable failure.
- [x] Add a data-management screen, distinct local/iCloud destructive confirmations, preserved-purchases/books explanation, minimal-reset-marker disclosure and pending/retry UI. Hide account-private learning during identity invalidation or deletion; retain useful guest navigation.
- [x] Test that destructive controls are disabled while another operation is active and late dialogs cannot target a replacement profile.
- [x] Run full `npm test`, `npm run typecheck`, native tests, `npm run test:build-settings`, `npm run test:free-duo`, `npm run test:native-headers`, and `EXPO_NO_DOTENV=1 npm run bundle:ios`; compile Release simulator with no real cloud/account access.
- [x] Independent task and whole-branch review. Fix actionable findings with covering regression tests. Record exact results and separate physical acceptance limitation; do not close #51 based on simulator evidence.
- [x] Hand off uncommitted work for user-directed commit/push/PR; preserve worktree and private test data.
