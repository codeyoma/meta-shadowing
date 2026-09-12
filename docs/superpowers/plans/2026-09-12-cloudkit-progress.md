# Private CloudKit Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Back up and restore sample learning progress using private CloudKit without blocking local learning or mixing accounts.

**Architecture:** Keep synchronous SQLite learning stores, isolated by profile. A coordinator manages consent, identity generations and backup revisions; a native Expo module uses CKSyncEngine for immutable progress assets and per-writer heads. Restore installs a validated logical snapshot without invoking reward actions.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, SQLite, Swift, CloudKit/CKSyncEngine, iOS 26.0 minimum.

**Spec:** `docs/superpowers/specs/2026-09-12-cloudkit-progress-design.md`

## Global Constraints

- No Supabase, email signup, administrative user database, purchased lesson payloads, or public CloudKit records are added.
- Learning never waits for a cloud response.
- Preserve existing run identities and zero-XP records.
- Each backup generation is an immutable, uncompressed UTF-8 JSON asset with a 16 MiB application limit.
- No live container, team, account or device identifier in committed files or logs.
- Preserve guest data and all unrelated dirty UI changes. Commit only each task's exact paths on the current native branch; no push or cloud deployment.
- Use the existing isolated native worktree. Test seams are owner-approved: save/restore, consent/account isolation, and external-cloud failures.
- Final review includes #45 and #49 from baseline `6ebb68b97a0ecc26bf8b3e9e074c68fe6eab0066`.

## Task 1: Transactional progress backup store

**Files:** Modify `src/core/journal.ts`; create `src/core/progress-backup.ts`, `src/core/progress-backup.test.ts`. Small companion validators may live in `src/core/progress-backup-codec.ts`.

**Interfaces:**
```ts
interface BackupDatabase extends Database {
  all<T>(sql: string, ...args: (string | number)[]): T[];
}
class ProgressBackupStore {
  constructor(db: BackupDatabase, now?: () => Date);
  readonly journal: Journal;
  revision(): number;
  pending(): boolean;
  acknowledge(revision: number): void;
  exportBackup(): string;
  restoreBackup(json: string): void;
  readValue(key: 'settings' | 'selection'): string | null;
  saveValue(key: 'settings' | 'selection', value: string): void;
  hasData(): boolean;
}
function validateProgressBackup(json: string): ProgressBackup;
```

- [ ] Add a real SQLite test proving a complete run and unfinished second-stage cycle survive export/restore with exactly 10 XP and their original study date. Repeat restore and verify no duplicate history.
```ts
const source = new ProgressBackupStore(sqlite(), () => new Date('2026-09-12T12:00:00Z'));
const session = createSession({runId:'finished',stage:1,phraseCount:1,mode:'manual',rate:1});
source.journal.save('sample-v1', {...session,confirmed:3,phase:'complete'}, {language:'en',book:'sample'});
source.journal.save('sample-v1', {...session,runId:'unfinished',stage:2,phrase:0,confirmed:1,audioSeconds:1.25,phase:'listening'});
const target = new ProgressBackupStore(sqlite(), () => new Date('2026-09-13T12:00:00Z'));
target.restoreBackup(source.exportBackup()); target.restoreBackup(source.exportBackup());
assert.equal(target.journal.progress.summary('en').xp, 10);
assert.equal(target.journal.load('sample-v1',2,1)?.audioSeconds,1.25);
```
- [ ] Run `npx tsx --test src/core/progress-backup.test.ts`; observe missing interface failure before writing implementation.
- [ ] Implement versioned export of checkpoints, completions, daily stages, awards, study days and preferences. Export within a SQLite read transaction. Add a durable revision increment in Journal's save transaction using an optional synchronous constructor callback; default existing journals remain compatible. Initialize profile metadata before supplying that callback.
```ts
this.journal = new Journal(db, now, () => {
  db.run('UPDATE backup_state SET revision=revision+1 WHERE id=1');
});
```
- [ ] Validate size before JSON.parse; exact keys/allowed tables and columns, integer ranges, stage/session compatibility, finite numbers, real calendar dates, duplicate compound keys, allowed settings/selection shape, and reward/history consistency. Reject arbitrary SQL/table names and extra data. Normalize restored running sessions to paused. Preserve historical zero-reward records; do not invoke `Progression.record` during import.
- [ ] One failing test at a time: rejected malformed/duplicate/oversized payload, transaction rollback preserving old data, preferences atomically restored, older acknowledgement leaves newer revision pending, original history without invented XP. Restore identical content is idempotent; disallow overwrite of different nonempty stores (integration restores into a fresh inactive profile).
- [ ] Run focused tests after every slice and `npm run typecheck`. Run full `npm test` before committing only task paths. Report exact RED/GREEN commands and output plus public interface details.

## Task 2: Native private CloudKit transport

**Files:** Create local Expo module `modules/progress-cloud/` with Swift transport/model/store files, module bridge and TypeScript binding; create `tests/cloudkit/` isolated native tests and config-plugin tests under `src/core/progress-cloud-config.test.ts`. Modify `app.json` only to register the plugin. Do not edit Task 1 or UI paths.

**Interfaces (JSON bridge values; never log private payloads):**
```ts
type CloudAccount = {status:'available';scope:string} | {status:'unavailable'|'no-account'|'unknown'};
type CloudBackup = {id:string;createdAt:string;revision:number};
interface ProgressCloud {
  account(): Promise<CloudAccount>;
  list(scope:string): Promise<CloudBackup[]>;
  read(scope:string,id:string): Promise<string>;
  publish(scope:string,revision:number,json:string): Promise<{revision:number}>;
  stop(): Promise<void>;
  // Expo event `accountChanged`: no raw identity payload; coordinator rechecks.
}
```

- [ ] Read applicable Expo module, Swift and native/config/lifecycle instructions. Scaffold through create-expo-module with nonprivate fictional author metadata, remove generated examples and unsupported platforms, retain only iOS module functions/events. Use `requireOptionalNativeModule` so missing signing/module configuration yields unavailable, never a crash.
- [ ] Write failing native tests against a public backup publication boundary with an injected external transport/persistence seam: data upload must precede head acknowledgement; a late old revision cannot acknowledge a new one; current plus previous remain recoverable; corruption is rejected. Use Swift Testing and actual temp-directory persistence, not a fake that reimplements policy.
```swift
// Public behavior assertions for the native transport test suite:
#expect(result.revision == submittedRevision)
#expect(restoredJSON == submittedJSON)
#expect(try store.reopen().pendingRevision == submittedRevision)
```
- [ ] Implement an account-isolated native owner of CKSyncEngine, durable engine state, in-flight generation, pending publication, saved CKRecord system fields, and fetched record metadata/assets. Derive opaque scope from native current user record plus configured container/environment; check current identity before and after await and in record-batch delivery. Cancellation alone is not sufficient; invalidate generation and refuse stale callbacks.
- [ ] Implement immutable `ProgressBackup` CKAsset records and `ProgressBackupHead` with current/previous identifiers and hashes. Bound bytes to 16 MiB; validate hash and referenced metadata before returning JSON. Save backup then head with expected system fields; only acknowledge revision after head save. Persist work before scheduling; on restart resume same generation; handle transient retries, quota, permission, malformed data and conflicts with fixed sanitized error codes.
- [ ] Implement listing only after successful initial fetch (empty result differs from failure), and reads bound to current scope. Keep fetched assets in app-owned bounded staging until safely usable; do not persist an ephemeral CloudKit URL as the only recovery copy. Use a head's previous generation for explicit recovery when current is damaged.
- [ ] Retain current and previous acknowledged generations. Delete only proven superseded records for this installation writer after head acknowledgement; persist exact cleanup candidates. Never delete another writer/profile, referenced record, or last valid backup to satisfy quota. If safe cleanup cannot be established, preserve data and surface limitation.
- [ ] Config plugin reads optional `APPLE_CLOUDKIT_CONTAINER` from ignored local environment. Validate its syntax without inventing a live ID. Configure iCloud/CloudKit, push and remote-notification settings using supported Expo APIs. Absence leaves local app functional; existing StoreKit configuration untouched. Test plugin with `iCloud.com.example.progress` only.
- [ ] Compile and run isolated Swift tests; run `npm run typecheck` and plugin tests. Build the app only after controlled local prebuild/pod integration; no Apple account mutation or production schema deployment. Report unavailable real CloudKit acceptance honestly. Commit only task files and provide test evidence/interface notes.

## Task 3: Account-scoped coordinator and Settings integration

**Files:** Create `src/core/progress-sync.ts`, `src/core/progress-sync.test.ts`, `src/native/progress-sync.ts`, `src/components/icloud-backup.tsx`, `src/components/progress-profile.tsx`; modify `src/native/journal.ts`, `src/native/settings.ts`, `src/components/library-context.tsx`, `src/app/_layout.tsx`, `src/app/(tabs)/settings/index.tsx`, and targeted player lifecycle/save binding if required.

**Consumes:** `ProgressBackupStore` from Task 1 and `ProgressCloud` from Task 2. Existing Journal callers continue to work, but each player holds its original profile journal.

**Produces:** Coordinator public `refreshAccount()`, `enable(importGuest:boolean)`, `restore(id:string)`, `retry()`, `disable()`, and snapshot subscription. Native `getJournal()` resolves current profile for new callers; stable handles retain original profile ownership.

- [ ] Write a failing public coordinator test with real SQLite profiles and a deferred external CloudKit fake: guest progress cannot upload before explicit `enable(true)`, and failed initial list cannot be interpreted as no backup.
```ts
await coordinator.refreshAccount();
assert.equal(cloud.published.length,0);
await coordinator.enable(true);
assert.equal(cloud.published.length,1);
assert.equal(guest.journal.completions('sample-v1',1),1);
```
- [ ] Implement explicit profile selection/consent stored durably per confirmed scope. Legacy guest database/keys stay readable and untouched by account restoration. Copy guest preferences into a logical import only after consent. For existing cloud backups, require explicit selection/restore rather than uploading defaults or silently merging. Use a new inactive profile and switch only after successful import/pointer commit.
- [ ] Add red-green cases for sign-out/switch during list, read and publish; unknown account status retains local progress but suspends cloud work; repeat restore and delayed fetch preserve newer local progress. Reject stale UI choices by binding backup IDs and consent to the account generation that produced them.
- [ ] Coalesce pending journal changes and schedule publication at most once per minute plus explicit retry/lifecycle opportunities. Capture revision and JSON together, never acknowledge a later revision. Serialize refresh/enable/restore/retry safely; clean subscriptions and timers on teardown. Persistent dirty revision recovers bridge gaps after restart.
- [ ] Wire the adapter into app lifecycle and remount account-scoped library/player consumers safely on profile switch. Pause/save the old session before switching, bind closure to old journal, and prevent automatic stage-entry playback during account change. A local-save failure aborts user-initiated profile switch with actionable feedback.
- [ ] Settings shows `iCloud 백업`, explicit enable/import choices, available recovery candidates without account/device identifiers, disable-local-sync action (no data deletion), retry, and actionable error text. No routine alerts or success toasts. Preserve main Settings purchase restore and existing user UI styles. Do not implement another playback-speed control.
- [ ] Run focused tests, typecheck, full suite, and native release simulator build. Inspect Settings and profile-switch recovery with native UI where available. Commit only #49 hunks; coordinate overlapping #45 Settings import/render so those existing changes are not lost.

## Task 4: Acceptance evidence and combined review

**Files:** Create `docs/cloudkit-progress.md`; update this plan checkboxes and design status accurately. Include pending #45 files in a separately scoped commit after privacy/diff review: purchase presentation/tests, restore component, Settings purchase-restore hunk and `docs/storekit-purchases.md`.

- [ ] Run `npm test`, `npm run typecheck`, `git diff --check`, native CloudKit test host and relevant StoreKit regression tests. Record exact totals and distinguish prior test evidence from current runs.
- [ ] Inspect generated entitlements privately. If container/signing/test iCloud identity are missing, record the exact prerequisite category; do not invent values or claim cloud acceptance. Document a controlled sample backup/reinstall test preserving the owner's unsynced data.
- [ ] Privacy-scan exact staged content and use repository no-reply commit identity. Commit only #45/#49 work; preserve unrelated dirty UI changes. No push.
- [ ] Run the requested two-axis code-review from #44 baseline, passing both #45 and #49 specs and exact scoped commit/diff paths. Address correctness findings and re-run covering tests. Real sandbox/CloudKit acceptance gaps keep respective tickets open.

## Self-review and execution record

The task chain is 1 (store) -> 2 (transport) -> 3 (integration) -> 4 (verification).
The store and native transport share only revision/JSON contracts. UI integration
does not authorize new reward computation or mutable cross-account ownership.
Task 3's guest preferences are copied only at consent; restored preferences use
Task 1's transaction. Acknowledged current/previous heads make retention testable.
Missing Apple setup gates live tests, not local implementation. Execution is in
the current session as requested; no additional planning approval is required.
