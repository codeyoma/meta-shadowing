# Swift-native Apple Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The owner selected sequential implementation by the main agent. Steps use checkbox syntax for tracking.

**Goal:** Complete #98 by connecting verified purchases, Apple-hosted installation and optional private CloudKit recovery to the native product without weakening local learning or reset safety.

**Architecture:** Add an AppleServices package for service contracts, owned adapters and orchestration. AppFoundation consumes narrow service values; LearningDomain remains independent of Apple frameworks. SQLite owns atomic learning changes and durable recovery intents; the app root owns profile/workspace replacement.

**Tech Stack:** Swift 6, Swift Testing, SQLite, SwiftUI/UIKit, StoreKit 2, Background Assets, CloudKit/CKSyncEngine, XcodeGen.

**Spec:** `docs/superpowers/specs/2026-09-27-swift-native-migration-design.md`, sections 3–7; GitHub #98 under #91. Consumers also follow `docs/swift-native/learning-storage-contract.md`, `product-ui-contract.md` and `reference-tools-contract.md`.

**Status:** Implementation and the local verification suite are complete as of 2026-09-29: 334 package tests and all 96 iOS 27 scheme tests pass. Independent review fixes are verified. The extended service UI matrix below and separately authorized live-service/device acceptance remain open; see `docs/swift-native/apple-services-contract.md`. Work is retained on the feature branch; no push, PR or issue closure is included.

## Global constraints

- Preserve all current functionality and use native iOS interaction conventions.
- Minimum iOS 26.0; simulator verification requires iOS 27, with no fallback.
- No benchmark or numerical performance-improvement gate.
- Preserve the reference implementation; do not link Expo, React Native or JavaScript into the Swift app.
- Reuse existing app, product, package and container configuration. Keep resolved identifiers, private content and raw service evidence out of commits and public reports.
- Use fresh, isolated native storage. Existing test-data migration is not required; automatic sync starts disabled.
- No Supabase, new service registration, schema deployment, TestFlight upload, release, real-money purchase or implicit live-data deletion.
- Physical installation/account access/destructive service testing require a separately designated target and authorization. Earlier tests are not blanket permission for #98 resets.
- Learning remains local-first. Only explicit practice confirmation earns credit; service callbacks, merge, restore and retries never award new practice.
- Preserve unrelated dirty files, including the modified legacy StoreKit test. Do not commit the untracked umbrella documents incidentally.
- Begin implementation from current `origin/dev` on `codex/swift-apple-services`, preserving unrelated changes. The prior reference-tools branch is merged. Reuse the existing native worktree if switching is safe; do not force a switch over overlapping work.
- Commit scoped work under the implement request after verification/review. Do not push or open a PR until requested. Do not wait for hosted CI after a future push.

## Design decisions

The selected approach is reviewed extraction of the standalone Swift services, not linking Expo wrappers and not a wholesale rewrite. Preserve their validated publication/reset protocols and improve concurrency ownership where required. Direct wrapper reuse would retain runtime coupling; a complete rewrite would discard useful failure-path coverage.

1. **Purchase authority:** StoreKit verified, current, matching non-consumable transactions authorize paid content. Product metadata and installed files never grant ownership. Unknown/unverified/revoked/expired or obsolete authority denies paid access without deleting content/history. A non-consumable has no app-invented expiry; test expiration defensively where supplied. Offline use relies on StoreKit's verified local transaction evidence, not a persisted application boolean or guessed grace period. Catalog lookup failure alone must not erase valid ownership. Forced `AppStore.sync()` is an explicit Restore action only.
2. **Catalog and installation:** Keep bundled Morning Notes. Compose configured sample/free/paid hosted entries with validated installed descriptors. Stage, validate all pinned bytes/hashes and semantic manifests, then publish under a current authorization lease. Scope removal to the selected installation; no progress reset. Return validated syntax descriptors to #97 and emit `referenceChanges` even when an authority replacement grants the same package.
3. **Profile authority:** Persist guest/account profile mapping and consent separately from learning history. Bind account scope to container, environment and verified account identity. A generation identifies each active profile/service session. Switching closes the old player/reference flow, revokes writers, invalidates callbacks and then replaces its workspace. StoreKit and iCloud accounts are separate authorities, not interchangeable identities.
4. **Sync:** Explicit initial recovery/merge choice precedes publication. Fetch, validate all candidates, verify the head has not changed, merge atomically against the latest local state, then conditionally publish. A fresh empty store never publishes over existing cloud history. Retain compatible v1–v4 import and v5 reset envelopes; no new cloud schema by default. Preserve the existing singleton-head, conditional-write and exact cleanup-authority protocol.
5. **Deletion:** Download removal, local-history deletion and cloud-history deletion have separate actions and confirmations. Local deletion works offline, disables sync and retires local transport caches without writing cloud data. Explicit cloud deletion commits a durable reset generation and conditionally publishes it before adopting the boundary locally. A retry uses the same persisted request identity. A later reset must prevent an old device from resurrecting pre-reset records; failed cleanup remains pending, not reported as successful deletion.
6. **Execution ownership:** Keep framework-required callbacks on their required actor. Move bulk payload validation, file hashing/copying and cache serialization off MainActor into owned actors. No unbounded detached work, repeated subscriptions or parallel reconciliation for one account. Cancel timers/tasks on disable, background and teardown; generation checks still reject non-cooperative late results.

## Review focus

- Same-package authority replacement must invalidate an already open player/reference view, even if the new permission is also allowed. Tasks 1/2/5 test it.
- Account changes during download publication, cloud fetch or local merge must not mutate the newly selected profile. Tasks 2/4/5 test delayed old callbacks.
- A process death between remote reset acknowledgement and local adoption must resume the same intent without erasing newer same-generation learning. Tasks 3/4 test restart at each boundary.
- One invalid legacy cloud candidate must prevent a partial merge or cleanup of valid candidates. Task 4 tests aggregate validation and transaction rollback.
- Disk-full/rename failure, symlink escape and corrupt manifests must leave no playable partial installation or erased history. Task 2 tests each boundary.

## File and interface map

New `native-ios/Packages/AppleServices/` contains:

- `Package.swift`: Swift 6 package, iOS 26/macOS-supported testable core; iOS-only adapters conditionally compiled. No dependency on AppFoundation.
- `Sources/AppleServices/Ownership/`: Sendable snapshots/events, verified StoreKit adapter and revisioned access leases.
- `Sources/AppleServices/Delivery/`: immutable package descriptors, actor-owned installation/download state and Background Assets adapter.
- `Sources/AppleServices/Cloud/`: typed account/transport values, CKSyncEngine adapter, account-scoped durable cache and sync coordinator.
- `Tests/AppleServicesTests/`: public fixtures, controllable service seams and real filesystem tests. Framework-specific cases run in the iOS test target, not as fictitious macOS coverage.

Existing integration points:

- `LearningDomain/LearningStore.swift` and `LearningPersistence/`: transactional batch merge, reset adoption and durable service metadata. Ordinary learning APIs retain their current meaning.
- `AppFoundation/ProductCatalog.swift`, `ProductWorkspace.swift`, `ProductModel.swift`: mutable service-backed catalog, explicit service actions and authoritative profile replacement.
- New `AppFoundation/InstalledProductCatalog.swift`, `ProductServicesModel.swift`, `ProductProfileOwner.swift`: separate catalog decoding, presentation state and workspace lifetime responsibilities.
- `App/RootView.swift`, `Browsing/LibraryView.swift`, `Browsing/BookCardView.swift`, `Settings/SettingsView.swift`: connect native controls to service models. Add `PurchaseRestoreView.swift`, `CloudSyncView.swift`, `DataManagementView.swift` beside the settings views.
- `native-ios/project.yml`, `project-ci.yml`, `Config/Example.xcconfig`, `Config/CI.xcconfig`, product/configuration guards and `.github/workflows/ci.yml`: service compilation, fixture targets and narrowly configured signing.

Public seams to define in the owning task:

- `OwnershipService`: `refresh() async`, `purchase() async`, `restore() async`, `snapshots() async -> AsyncStream<OwnershipSnapshot>`, `stop() async`. Snapshot separates catalog errors, action outcome and current access authority.
- `ContentDelivery`: `state(packageKey: String) async throws -> DeliveryState`, `download(packageKey: String) async throws`, `cancel(packageKey: String) async`, `remove(packageKey: String) async throws`, `installation(packageKey: String) async throws -> InstalledPackage`. Descriptors come only from validated configuration, never arbitrary view paths.
- `CloudTransport`: typed `account()`, `list(scope:)`, `read(scope:id:)`, `publish(scope:revision:payload:base:)`, `reset(scope:requestID:expectedGeneration:payload:)`, `cleanupAdopted(scope:base:abandoned:)`, `stop()`, all async. Preserve the current transport's exact conditional/publication semantics while replacing string dictionaries/JSON strings at callers with Sendable values/Data.
- `SyncCoordinator`: `refreshAccount() async`, `enable(importGuest: Bool, generation: UUID) async throws`, `refresh(importGuest: Bool, generation: UUID) async throws`, `disable(generation: UUID) async throws`, `removeLocal(generation: UUID) async throws`, `deleteCloud(generation: UUID) async throws`, `retry() async`, `stop() async`. Confirmation tokens bind to the displayed account/profile generation; stale consent is rejected.

## Task 1: Verified ownership integrated with a testable service boundary

**Files:** AppleServices package and `Ownership/`; `native-ios/Tests/AppleServiceIntegrationTests/OwnershipTests.swift`; public fictional StoreKit fixture; project package/test-target wiring.

**References:** `modules/package-store/ios/PackagePurchases.swift`, `PackageAccess.swift`, `tests/storekit/Tests/PackagePurchasesTests.swift` (read only; preserve its unrelated edit).

**Produces:** `OwnershipService`, `OwnershipSnapshot` and revisioned access lease. Every authority replacement advances revision, not just allowed/denied transitions.

- [x] Write failing tests for verified local ownership, missing/mismatched product, unverified results, revoked/expired transactions, pending/cancel/error, duplicate transaction updates and a late refresh after restore failure. Assert no XP, history or download side effects.
- [x] Run `swift test --package-path native-ios/Packages/AppleServices --filter Ownership` for seam tests. Run targeted iOS StoreKit tests for actual `VerificationResult<Transaction>`/`SKTestSession` behavior. Record the failing assertions before implementing.
- [x] Extract reviewed logic without singleton/wrapper coupling; keep one owned transaction listener. Bind purchase completion/refresh to current authority generation. Finish verified transactions idempotently; do not treat finishing as learning credit.
- [x] Re-run focused tests. Resolve the known legacy iOS 27 fixture failures against observed results rather than skipping them. Verify an unavailable product catalog does not falsely revoke an otherwise verified entitlement.

## Task 2: Validated hosted catalog and atomic installation

**Files:** `Delivery/`; new `AppFoundation/InstalledProductCatalog.swift`; `ProductCatalog.swift`; `Tests/AppleServicesTests/DeliveryTests.swift`, `InstallationTests.swift`; `AppFoundationTests/InstalledProductCatalogTests.swift`.

**References:** `modules/package-delivery/ios/` excluding Expo module/podspec and diagnostic UI; `tests/delivery/Tests/`; `src/core/package.ts`, `paid-package.ts`, `free-test-package.ts`, `video-package.ts` for content semantics.

**Consumes:** Task 1 authority lease. **Produces:** `ContentDelivery`, installed manifest/media descriptors, `ProductCatalog.syntax` and authority-change events.

- [x] Write failing tests for sample/free/paid catalog states, unavailable configuration, interruption/relaunch, duplicate starts, cancellation before OS progress arrives, repair and scoped removal. Pin all current supported package formats; do not narrow audio/video capabilities to the first hosted fixture.
- [x] Add real filesystem tests: altered hash/length, traversal/symlink, changed immutable version, malformed manifest/source mapping, disk-write/publication failure and revocation between validation/publication. Assert no partial playable directory and unchanged learning backup after removal.
- [x] Run the focused `Delivery`, `Installation` and `InstalledProductCatalog` test filters and record RED.
- [x] Extract installation/download logic into explicit injected roots and actors. Validate semantic content before ready publication, confine all paths, bound allocations and preserve old verified versions. Use the reviewed synchronous authorization lease only for the short publication critical section, never during downloads/hashing.
- [x] Implement mutable catalog projection. Missing syntax stays unavailable; a validated syntax file carries its declared byte/hash descriptor. Emit invalidation on install/remove/revoke/account replacement, including allowed-to-allowed replacement.
- [x] Run focused suites and `swift build --package-path native-ios/Packages/AppFoundation`; compile the real Background Assets adapter on iOS 27. Keep the iOS 26 availability branch and do not claim hosted delivery from a fake transport.

## Task 3: Transactional profile/reset foundation

**Files:** new `LearningPersistence/LearningServiceStorage.swift`, `LearningProfileStorage.swift`; `LearningBackupStorage.swift`, `LearningSchema.swift`; narrowly extend `LearningDomain/LearningStore.swift`; tests in `LearningPersistenceTests/ServiceStorageTests.swift`, `ProfileResetTests.swift`.

**Consumes:** Existing `BackupSnapshot`, codec and learning-store lease rules. **Produces:** atomic service metadata, profile consent and reset intent operations.

Interfaces: add `mergeBackups(_ payloads: [Data], profileID: String) async throws -> BackupSnapshot`; define a separate actor `ServiceProfileStore` protocol for typed profile mapping/consent/reset intents; add `adoptReset(_ payload: Data, profileID: String, expectedGeneration: String?) async throws -> BackupSnapshot` guarded by revoked leases and a verified reset intent. Do not expose an unrestricted replace-database API to views.

- [x] Write failing real-SQLite tests for all-or-nothing multi-candidate validation, concurrent local confirmation before merge, duplicate receipts and canonical export. One malformed candidate must leave revision/content unchanged.
- [x] Test guest/account isolation, persisted disabled-by-default consent, local reset while offline, exact-intent retry after reopening and reset-generation compare failure. Inject failure at every transaction boundary; unrelated profiles/content remain intact.
- [x] Run `swift test --package-path native-ios/Packages/LearningPersistence --filter 'ServiceStorage|ProfileReset'` and record RED.
- [x] Add schema migration preserving existing native stores; reject corrupt/future schemas without erasing them. Store profile-scoped consent/intent durably. Replace all affected checkpoint/ledger/command rows atomically only for authorized reset; merging retains current monotonic semantics.
- [x] Run the full persistence package plus `swift build --package-path native-ios/Packages/AppFoundation`. Verify old writers cannot save after reset/profile retirement and a reopened valid writer resumes paused without new XP.

## Task 4: Private CloudKit reconciliation and reset recovery

**Files:** `AppleServices/Cloud/`; `AppleServicesTests/SyncCoordinatorTests.swift`, `ResetRecoveryTests.swift`; native `AppleServiceIntegrationTests/CloudTransportTests.swift`.

**References:** `modules/progress-cloud/ios/` excluding wrapper/podspec; `tests/cloudkit/Tests/`; `src/core/progress-sync.ts`, `progress-sync.test.ts`, `progress-envelope.ts`, `progress-envelope.test.ts`.

**Consumes:** Task 3 store/profile interfaces. **Produces:** typed `CloudTransport`, `SyncCoordinator` and bounded status/error snapshots. The cloud wire protocol keeps existing record identities/conditional heads and v4/v5 backup formats.

- [x] Write RED tests: initial disabled store performs no upload; existing cloud history must be fetched and validated before any publication; explicit guest import merges rather than replaces. Recheck fetched heads before SQLite mutation and before conditional publication.
- [x] Test reordered/duplicate receipts, local edits during fetch, conflicting heads, malformed/future/oversized backups, no account/offline/quota/permission errors and changed account during every await. Assert stale work cannot write or acknowledge the new profile.
- [x] Test durable reset at crash points before request, after remote acknowledgement and before local adoption/cleanup. Reuse the request ID; adopt the newest accepted generation; do not erase newer same-generation progress. A stale client's pre-reset publish must fail rather than resurrect history.
- [x] Run focused coordinator/reset tests and record RED. Port the existing conditional-publication, singleton, retirement, network and owner regression cases to the new adapter boundary.
- [x] Implement fetch/validate/recheck/batch-merge/conditional-publish with at most three immediate conflict attempts. Acknowledge only the exported revision actually accepted; later local work remains pending. Preserve exact cleanup authority and retry journals through process death.
- [x] Keep learning free from cloud waits. Use one reconciliation task, coalesced committed-revision signals and bounded retry scheduling; cancel on disable/background/account replacement. Preserve one-shot manual refresh without toggling automatic sync. Separate account lookup from activation and zone/cache creation.
- [x] Run focused packages, native adapter tests and strict Swift compilation. Test payload processing off MainActor. Missing signing/configuration remains an unavailable state, not a successful cloud test.

## Task 5: Native product actions and lifecycle integration

**Files:** new AppFoundation `ProductServicesModel.swift`, `ProductProfileOwner.swift`; `ProductModel.swift`, `ProductWorkspace.swift`; app root/browsing/settings files listed above; `Tests/AppUITests/AppleServicesUITests.swift`; native lifecycle tests.

**Consumes:** Tasks 1–4. **Produces:** normal UI for ownership, download/cancel/retry/remove, restore, optional sync and separately confirmed local/cloud history deletion.

- [x] Write failing model/UI tests for all visible service states and explicit actions. Ensure loading/pending cannot duplicate purchase/download. Errors retain a clear recovery action. Missing service configuration leaves bundled learning usable.
- [x] Add controllable late-result tests: account/profile switch closes old learning and analysis/dictionary, revokes writers, then installs the new workspace. Test ownership loss during playback and allowed-to-allowed replacement. No old callback changes new UI or resumes learning.
- [ ] Add UI tests that distinguish the three destructive operations, display the affected scope, reject stale confirmation tokens, and preserve history after download removal. Test long localized prices/status, largest Dynamic Type and Reduce Motion; manual VoiceOver is excluded by owner decision, not marked passed.
- [x] Run focused model/UI tests and record RED. Implement native controls and a single root-owned service composition. Keep generated public fixtures Debug-only, isolated from accounts and shipping configuration.
- [x] Verify settings/selection remain profile-scoped, sync is off on a fresh installation, and stored consent is not transferred between accounts. Refresh purchase authority on foreground without a forced restore prompt. Service status changes must not invalidate unrelated playback position views.
- [x] Re-run targeted tests and Debug/Release builds before proceeding to final verification.

## Task 6: Configuration, CI, review and evidence

**Files:** private configuration templates and project files listed above; native product/configuration scripts; `.github/workflows/ci.yml`; `docs/native-ci.md`, `native-ios/README.md`; new `docs/swift-native/apple-services-contract.md`.

- [x] Inspect existing configuration privately and map variable names, not values, into native build inputs. Reuse configured identities and immutable descriptors. Do not create registrations or read private account services merely to fill a template.
- [x] Add configuration regression tests for absent, partial and complete fictional service configuration. CI remains unsigned/accountless. Signed builds allow only the exact needed configured entitlements; do not replace the entitlement guard with a broad allow-all. Inspect whether the existing Background Assets configuration requires a downloader extension and reproduce that native target where required by the current Apple SDK/configuration.
- [x] Update Swift-only CI to run AppleServices core tests and actual native service fixture tests. Preserve all four required check names, privacy filtering, iOS 27 requirement and human release approval. No Expo test jobs, skip-to-green or remote ruleset changes.
- [x] Run focused tests regularly during implementation. At the end run every Swift package suite once and the complete native iOS 27 scheme once, with `-parallel-testing-enabled NO -collect-test-diagnostics never`. Also run clean CI configuration checks, Debug/Release builds, product guards, actionlint, branch-policy tests and `git diff --check`.
- [x] Use the requested `/code-review` skill after implementation. Review the complete scoped change against the approved spec/plan; fix valid findings with regression tests and rerun affected checks. Follow its independent-review requirements without delegating unapproved implementation work.
- [x] Record exact test evidence and limits in the service contract. Separate deterministic seams, real local StoreKit fixtures, signed-device checks and actual Apple-hosted/CloudKit results. Do not claim all #98 acceptance from green fixtures.
- [ ] Before live tests, present the exact installation, environment, disposable profile/data and operation to the owner. No account switch, cloud reset, paid purchase or device replacement without scoped authorization. Record configuration blockers as pending.
- [x] Inspect the staged diff for private identifiers/content and unrelated files, verify no-reply Git identity, and commit the scoped implementation to its current feature branch. No push, PR, issue closure or release is part of this step.

## Completion and handoff

Implementation completion requires the integrated normal app, passing scoped/full verification and completed review. Issue #98 completion additionally requires its designated service evidence or an explicit owner-approved follow-up boundary; blocked checks remain unchecked. W8/#99 still owns final migration parity and controlled cutover.

Plan self-review: every #98 checklist item maps to Tasks 1–6. #97 syntax/invalidation handoff maps to Tasks 2/5. Public payload compatibility, three deletion scopes and stale-client reset prevention are explicit. No new backend, speculative subscription, migration or service registration was introduced.

## Primary API references

- [StoreKit current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
- [Explicit App Store synchronization](https://developer.apple.com/documentation/storekit/appstore/sync())
- [Downloading Apple-hosted asset packs](https://developer.apple.com/documentation/backgroundassets/downloading-apple-hosted-asset-packs)
- [CKSyncEngine account changes](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5/event/accountchange)

Consult the installed Xcode 27 SDK and current Apple documentation while implementing adapter signatures; preserve iOS 26 guards. These references guide framework use, not claims of successful live integration.
