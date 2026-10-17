# Stage Detail and Study Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for direct execution, or superpowers:subagent-driven-development if the owner chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking. Do not begin implementation until the owner reviews this plan and selects its execution method.

**Goal:** Implement the supplied stage-detail layout in the actual native app, including persistent foreground learning-screen dwell time that excludes tools.

**Architecture:** A flow-owned monotonic recorder submits cumulative visit milliseconds through an authorized workspace into independent SQLite counters. Backups merge replica/book counters by maximum, without changing learning checkpoints or rewards. Stage views consume narrow summary values and preserve the existing prepared-lesson entry route.

**Tech Stack:** Swift 6, SwiftUI, Observation, actor-owned system SQLite, Swift Testing, XCTest/XCUITest, iOS 27 Simulator.

**Spec:** `docs/superpowers/specs/2026-10-16-stage-detail-study-time-design.md`

## Global Constraints

- Actual Swift/SwiftUI app only; Figma and the Expo reference remain unchanged.
- iOS 26 deployment minimum; use iOS 27 Simulator for native verification.
- Keep sixteen stage identities, access checks, three-run completion, checkpoints, manual confirmation, XP, and streak rules unchanged.
- Count foreground reading, paused learning, silent practice, and fullscreen video; exclude options/opening popovers, dictionary, analysis, preparation/error/completion screens, background, lock, and exit.
- Persist integer milliseconds every ten eligible seconds and at exclusion/exit boundaries; never infer historical time.
- Accumulate by profile, canonical language, and stable book identity across package versions; download removal retains history.
- Local backup/private-sync representation only; no live cloud/account mutation, new service, Supabase, public upload, physical-device installation, or release.
- Keep existing payload limits, profile/reset authority, and optional-sync consent/coalescing; no new network operation on the learning path.
- Preserve dirty bookshelf changes and unrelated `tools/`. Do not commit, push, open a PR, or change CI rules without a separate request.
- Do not interrupt the existing simulator preview without approval; use an available dedicated test destination or ask first.

## Review Focus

1. A delayed time write after profile reset or after another connection starts a replacement visit must fail without resurrecting history (Task 2).
2. A lost reply after a successful final save must be retryable without double counting or blocking a safe exit (Tasks 2, 5).
3. An imported high counter for this database's own replica must not be overwritten by a smaller local value; future local elapsed time still adds once (Tasks 2, 3).
4. Cancelling a tool while its pause/save is pending, then rotating or reappearing, must not start a second interval or strand the recorder (Tasks 4, 5).
5. An unavailable book, an old grouped checkpoint, a completed book, and the largest text size must retain truthful statistics and reachable actions (Tasks 6–8).

## File and Interface Map

- Domain: create `LearningDomain/StudyTime.swift` and `LearningDomain/StudyTimeBackup.swift`; extend `LearningStore.swift`, `LearningBackup.swift`, `LearningBackupCodec.swift`, and `LearningBackupMerge.swift` without modifying reward reducers.
- Persistence: create `LearningPersistence/LearningStudyTimeStorage.swift`; extend `LearningSchema.swift`, `SQLiteLearningStore.swift`, `LearningBackupStorage.swift`, and `LearningServiceStorage.swift`. Update the existing local Apple-service envelope validators in `AppleServices/Cloud/ProgressStore.swift` and reset construction in `AppleServices/Cloud/SyncReset.swift` to recognize the new format without changing hosted service configuration.
- Foundation: create `AppFoundation/StudyTimeRecorder.swift` and `AppFoundation/ProductStudyTime.swift`; extend `ProductWorkspace.swift` with book time, continuation metadata, and planned unit counts.
- App: create `Player/LearningStudyTime.swift`, `Browsing/StageDetailSummary.swift`, `Browsing/StageDetailHeader.swift`, `Browsing/StageFamilyView.swift`, and `Browsing/BookManagementMenu.swift`; refactor only the affected stage composition, player lifecycle, and shared book menu.
- Tests: focused domain, persistence, foundation, rendering, flow, and UI tests described below. New native unit suites use the existing integration target; reuse existing UI classes so the reviewed shard ownership does not change.

All package paths below are beneath `native-ios/Packages/<Package>/Sources/<Package>/` or the corresponding `Tests/<Package>Tests/`. App/test paths are beneath `native-ios/`.

## Execution Rules

Each task runs its failing test before implementation, then passes its focused tests and reviews its diff. Keep a failing cross-package API addition within one task rather than leaving unrelated targets uncompilable. No commits are authorized; record completed task checkboxes instead. Stop for a material mismatch with the approved design.

For native commands below, select and validate a dedicated iOS 27 simulator first. `NATIVE_STAGE_SIM_ID` is that verified destination, not a guessed or committed device ID. Build with `xcodegen generate --spec native-ios/project-ci.yml`; use `native-ios/DerivedData-stage-detail` as the ignored task build directory. Native tests run with `-parallel-testing-enabled NO -collect-test-diagnostics never CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`.

### Task 1: Validated Time Values and Backup Version 6

**Files:** Create domain `StudyTime.swift`, `StudyTimeBackup.swift`, and tests `StudyTimeTests.swift`, `StudyTimeBackupTests.swift`. Modify domain `LearningBackup.swift`, `LearningBackupCodec.swift`, `LearningBackupMerge.swift`.

**Interfaces:**
- `StudyTimeCounter(language: String, book: String, replicaID: String, milliseconds: Int64) throws`: immutable, Codable/Hashable/Sendable; canonical language/book rules match `LearningScope`, replica matches existing random database-writer identifiers, milliseconds range `0...9_007_199_254_740_991`.
- `StudyTimeLease`: immutable Codable/Equatable/Sendable, containing `id: UUID`, `handle: LearningHandle`, and `generation: UUID`; construction alone grants no write authority.
- `StudyTimeReceipt`: immutable Equatable/Sendable, containing `acceptedMilliseconds: Int64`, `bookMilliseconds: Int64`, `backupRevision: Int64`, and `retired: Bool`.
- `LearningBackup.studyTimeCounters: [StudyTimeCounter]`; `setStudyTimeCounters(_:) throws`; `studyMilliseconds(language:book:) throws -> Int64`; `withResetGeneration(_ generation: String?) throws -> LearningBackup`.

- [x] **1. Write failing tests** `counterValidation`, `legacyBackupsHaveZeroTime`, `counterUnionIsIdempotentCommutativeAndAssociative`, `sameReplicaUsesMaximum`, `differentReplicasSum`, and `rejectInvalidOrOversizedTimeBackup`. Assert equal-key values 10,000 and 8,000 merge to 10,000, a second replica with 4,000 yields 14,000, different reset generations reject, and aggregate overflow rejects before mutation.
- [x] **2. Run RED:** `swift test --package-path native-ios/Packages/LearningDomain --filter StudyTime`. Expected missing new types/API; retain the failure evidence.
- [x] **3. Implement values/codec/merge.** Version 6 has exact keys `version`, `generation`, `progress`, `studyTime`; `generation` is null or a valid UUID, `progress` remains the validated version-4 representation, and `studyTime` is a canonical sorted counter array. Continue decoding versions 1–5 with zero counters. Preserve the 16 MiB limit and validate the complete envelope. Include time in `hasLearningData`; do not generate study days or reward records from it. Update existing domain tests that inspect current exports to version 6 without rewriting historical version-1–5 import fixtures.
- [x] **4. Run GREEN:** all domain tests with `swift test --package-path native-ios/Packages/LearningDomain`. Existing progress/checkpoint tests and new counter tests must pass with no skips. Review codec compatibility and diff before Task 2.

### Task 2: Transactional SQLite Recording Leases

**Files:** Create persistence `LearningStudyTimeStorage.swift` and tests `StudyTimeStorageTests.swift`; modify domain `LearningStore.swift`, persistence `LearningSchema.swift`, `SQLiteLearningStore.swift`. Update forwarding stores in `App/ProductTestFixtures.swift`, `Tests/MediaIntegrationTests/LearningFlowTests.swift`, `AppFoundationTests/LearningControllerTests.swift`, `LearningMediaTests/GatedLearningStore.swift`, and `AppleServicesTests/Cloud/SyncGenerationTests.swift`.

**Interfaces added to `LearningStore`:**
- `beginStudyTime(handle: LearningHandle, visitID: UUID) async throws -> StudyTimeLease`
- `recordStudyTime(_ lease: StudyTimeLease, cumulativeMilliseconds: Int64) async throws -> StudyTimeReceipt`
- `finishStudyTime(_ lease: StudyTimeLease, cumulativeMilliseconds: Int64) async throws -> StudyTimeReceipt`
- `readStudyTime(profileID: String, language: String, book: String) async throws -> Int64`

- [x] **1. Write failing tests** `migrationPreservesVersionTwoProfile`, `cumulativeRetryAddsOnlyTheDifference`, `finalRetryAfterLostReplyReturnsSameTotal`, `replacementVisitRejectsOldConnection`, `resetGenerationRejectsLateFlush`, `reopenKeepsTimeWithoutResumingClock`, `higherReplicaFrontierIsNotLowered`, and `failureRollsBackCounterAndRevision`. For cumulative writes 10,000, 10,000, 8,000, 12,500 assert exactly 12,500 total; a new visit adding 2,500 yields 15,000. Seed the higher-counter fixture directly in this storage-level test; Task 3 tests actual backup import. Compare learning progress before/after for exact equality.
- [x] **2. Run RED:** `swift test --package-path native-ios/Packages/LearningPersistence --filter StudyTimeStorageTests`. Expected missing store methods or time tables.
- [x] **3. Add schema version 3 and implement all four methods.** Counter table key is `(language, book, replica)`. A local-only singleton visit row holds the token, writer/scope, captured authority generation, accepted cumulative milliseconds, and retired state. Reuse the profile database's random `metadata.writer` as its local replica. Begin/record/finalize validate existing writer authority, current singleton token, service generation, and no reset intent inside `BEGIN IMMEDIATE`. Apply only positive cumulative increases against the accepted frontier; finalization atomically applies the final increase and retires the visit. A retry of the same/lower finalized value returns its already accepted result; later new amounts reject. New visits invalidate older tokens. No per-tick/per-visit history table grows indefinitely.
- [x] **4. Update mandatory forwarding implementations in the same task.** Forward to the real underlying store; do not add production no-op defaults. Revocation clears active capabilities and cannot make a pending old write valid. Publish backup revisions only after a changed transaction commits; duplicates/no-ops do not publish another revision. Preserve existing checkpoint predecessor and duplicate-command logic.
- [x] **5. Run GREEN:** the focused `StudyTimeStorageTests`, then compile test conformers using `swift test --package-path native-ios/Packages/AppFoundation list`, the equivalent `LearningMedia` command, and the equivalent `AppleServices` command. The all-package execution gate follows Task 3's backup-adapter updates; do not claim it passed here. Inspect the migration fixture and separate-connection results before Task 3.

### Task 3: Backup, Restore, and Authorized History Reset

**Files:** Modify persistence `LearningBackupStorage.swift`, `LearningServiceStorage.swift`, AppleServices `Cloud/ProgressStore.swift`, and `Cloud/SyncReset.swift`; extend `LearningBackupStorageTests.swift`, `ProfileResetTests.swift`, `StudyTimeStorageTests.swift`, and AppleServices `Cloud/ProgressCloudTests.swift`, `Cloud/ResetTests.swift`, and `Cloud/SyncGenerationTests.swift`.

**Interfaces:** Task 1's backup counter/reset helpers and Task 2's receipt/read APIs. `snapshotBackup`, `installBackup`, and authorized reset retain their existing signatures.

- [x] **1. Write failing tests** `duplicateBackupRetainsTimeOnce`, `restoreUsesNewLocalReplicaForFutureTime`, `legacyImportDoesNotEraseMeasuredTime`, `timeOnlyProfileIsNotEmpty`, `resetClearsTimeWithoutResurrection`, `activeVisitSurvivesImportedOwnReplicaFrontier`, `versionSixEnvelopePreservesResetAuthority`, and `resetRejectsNonemptyTimeCounters`. Export 12,500 ms, import twice, then record a new 2,500 ms visit and assert 15,000, not 27,500. Verify deletion keeps zero after a stale pre-reset callback, download removal retains time, and rollback leaves the original bytes/revision intact. A version-6 reset with any time counter must be rejected before publication/deletion, while legacy version-5 resets remain accepted.
- [x] **2. Run RED:** `swift test --package-path native-ios/Packages/LearningPersistence --filter 'StudyTime|LearningBackupStorage|ProfileReset'`. Expected omitted time or incompatible reset envelope behavior.
- [x] **3. Implement transactional snapshot/install/reset integration.** Import counters by per-key maximum, never import visit capabilities or overwrite the target database's replica identity. Retain local accepted visit frontiers when an authorized merge changes aggregate counters. Clear counters and invalidate the singleton lease through existing authorized history reset. Replace hand-built version-5 reset wrappers in both persistence and `SyncReset.resetPayload` with `withResetGeneration`; retain legacy import fixtures rather than wrapping a current export inside version 5. Extend `ProgressEnvelope.generation` and `validateReset` with exact version-6/null-generation handling and an empty time-counter requirement for destructive resets. Do not relax the existing table/clock/run-empty checks. Verify time-only data blocks `restoreIntoEmptyProfile` as required.
- [x] **4. Run GREEN:** persistence and AppleServices package suites, then `bash native-ios/scripts/ci-swift-package-tests.sh` for all six host suites. Verify repeated/reordered payloads and reset-generation mismatches do not change XP, selection, or checkpoints. No live service calls.

### Task 4: Monotonic Recorder and Workspace Projections

**Files:** Create foundation `StudyTimeRecorder.swift`, `ProductStudyTime.swift`, and tests `StudyTimeRecorderTests.swift`, `ProductStudyTimeTests.swift`; modify `ProductWorkspace.swift` and `ProductWorkspaceTests.swift`.

**Interfaces:**
- `public protocol StudyTimeClock: Sendable { func now() -> Duration; func sleep(for duration: Duration) async throws }`; production `MonotonicStudyTimeClock` uses one `ContinuousClock` origin, not `Date` differences.
- `@MainActor @Observable public final class StudyTimeRecorder`: initializer takes `clock: any StudyTimeClock`, `save: @Sendable (Int64) async throws -> StudyTimeReceipt`, and `finish: @Sendable (Int64) async throws -> StudyTimeReceipt`; exposes `saveFailed: Bool`, `setEligible(_:)`, `flush() async -> Bool`, `retry() async -> Bool`, `close(discardUnsaved: Bool) async -> Bool`. Exactly one cancellable periodic task and one serialized save pipeline own cumulative values.
- Workspace `beginStudyTime(writerID: UUID, visitID: UUID) async throws -> StudyTimeLease`, `recordStudyTime(_:cumulativeMilliseconds:) async throws -> StudyTimeReceipt`, and `finishStudyTime(_:cumulativeMilliseconds:) async throws -> StudyTimeReceipt` validate their own active controller/profile and delegate to Task 2.
- `BookStudySummary` gains `studyMilliseconds: Int64`, `latestStage: Int?`, and `plannedUnitCounts: [Int: Int]`, defaulting to zero/nil/empty for existing test-only construction. Production `load()` fills them from current authorized storage/plans.

- [x] **1. Write failing tests** `eligibleIntervalsExcludeToolsAndInactiveTime`, `checkpointUsesElapsedNotTickCount`, `fractionalIntervalsRetainRemainders`, `duplicateEligibilityAndDelayedSaveDoNotDoubleCount`, `retryKeepsLatestCumulativeValue`, `closeSerializesWithPendingCheckpoint`, and `oldWorkspaceCannotWriteAnotherProfile`. With a fake clock, count 4 s active + 3 s paused, exclude 20 s tool time, count 3 s active, and assert exactly 10,000 ms. A fake wall-clock jump must have no effect.
- [x] **2. Run RED:** `swift test --package-path native-ios/Packages/AppFoundation --filter 'StudyTime|ProductWorkspace'`. Expected missing recorder/projection APIs.
- [x] **3. Implement recorder and workspace extension.** Capture eligible intervals synchronously before awaits. Checkpoint every ten eligible seconds, not ten timer ticks; serialize/coalesce saves and retain a larger pending cumulative value when an earlier await completes. On close, stop eligibility before awaiting persistence; only discard when explicitly requested. Repeated close is safe. Build book projections during existing workspace loading, including times for unavailable books; do not turn periodic saves into library reloads.
- [x] **4. Run GREEN:** full AppFoundation suite and all six host package suites. Tests use fake sleepers/clock advancement, never ten-second real sleeps. Review that no learning reducer/media clock depends on the recorder.

### Task 5: Presented-Lesson Lifecycle and Save Recovery

**Files:** Create `App/Player/LearningStudyTime.swift` and `Tests/MediaIntegrationTests/LearningStudyTimeTests.swift`; modify `LearningFlow.swift`, `LearningPlayerView.swift`, and existing `LearningFlowTests.swift`/`LearningEntryTests.swift` only where their lifecycle expectations require updates.

**Interfaces:** Flow gains `setStudyPresentation(visible: Bool, active: Bool)`, `refreshStudyEligibility()`, `retryStudyTime() async -> Bool`, and `requestStudyExit(discardUnsaved: Bool) async -> Bool`. The dedicated helper owns Task 4's recorder/lease and generation; video subviews do not create recorders.

- [x] **1. Write failing native tests** `preparationNeverCountsUntilPresented`, `pausedAudioVideoAndSilentCount`, `allOptionRoutesAndDictionaryExcludeTheirPendingAndVisibleTime`, `cancelledPendingPopoverRestoresEligibilityOnce`, `rotationDoesNotRestartVisit`, `backgroundReturnDoesNotResumeMedia`, `completionAndAccessLossStopTime`, `failedFinalSaveBlocksExitUntilRetryOrExplicitDiscard`, and `oldDismissalCannotCloseReplacementRecorder`. Reuse fake time with real SQLite fixtures and assert unchanged XP/cycles/checkpoints except ordinary explicit learning operations.
- [x] **2. Run RED:** generate the CI project and run `xcodebuild test -project native-ios/MetaShadowingNative.xcodeproj -scheme MetaShadowingNative -destination "platform=iOS Simulator,id=$NATIVE_STAGE_SIM_ID" -derivedDataPath native-ios/DerivedData-stage-detail -parallel-testing-enabled NO -collect-test-diagnostics never -only-testing:NativeMediaIntegrationTests/LearningStudyTimeTests CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`. Expected missing lifecycle hooks.
- [x] **3. Integrate eligibility.** Gate on actual presentation, active scene, valid runtime/access, noncomplete/nonclosing state, and no opening/presented tool or dictionary. Exclude synchronously at accepted open requests, including pause/save awaits; recompute after cancelled/failed tools settle. Capture background/exit/access/completion boundaries before asynchronous cleanup. Fullscreen changes retain the same lesson owner. Flush before revoking writer/profile authority. A late old-generation callback cannot restart timing.
- [x] **4. Add actionable recovery.** Normal saves remain quiet. An explicit failed time exit offers `다시 저장` and `저장하지 않고 나가기`; a pending learning checkpoint failure still cannot be discarded via this separate time option. Service/profile boundaries throw rather than silently crossing with unsaved time. Confirm no media resumes on tool dismissal/retry and no extra state is retained after close.
- [x] **5. Run GREEN:** native `LearningStudyTimeTests`, `LearningFlowTests`, `LearningEntryTests`, and `ReferenceLifecycleTests`; all selected cases pass without skips. Review teardown/cancellation ownership before UI work.

### Task 6: Pure Stage Families, Continuation, and Statistics

**Files:** Create `App/Browsing/StageDetailSummary.swift`, `Tests/MediaIntegrationTests/StageDetailSummaryTests.swift`; update foundation summary construction from Task 4 only if the production projection requires it.

**Interfaces:** `enum StageFamily: Int, CaseIterable` with `.shadowing` (1–6), `.grouped` (7–10), `.crazySpeaking` (11–16); `StageDetailSummary.init(summary: BookStudySummary, verifiedTestAccess: Bool)` projects `continuationStage: Int?`, `isReview: Bool`, `unit: Int`, `unitCount: Int`, `completedPercentage: Int`, and family completed counts. `StudyTimeText` projects `compact` and `accessibility` from `milliseconds: Int64` using localized formatting.

- [x] **1. Write failing tests** `familiesPartitionSixteenStages`, `ringsRequireThreeRuns`, `latestEligibleUnfinishedWins`, `lockedOrMissingLatestFallsBackSafely`, `completedBookOffersReview`, `groupedResumeUsesSavedUnitCount`, `unavailableBookRetainsTimeButCannotLaunch`, and `durationFormattingDoesNotRoundUp`. Assert family counts 6/4/6; 3 completed stages gives 19%; duration values 0, 59,999, 60,000, and 9,360,000 ms yield `0분`, `1분 미만`, `1분`, and `2시간 36분` respectively.
- [x] **2. Run RED:** the native test command from Task 5 selecting `NativeMediaIntegrationTests/StageDetailSummaryTests`.
- [x] **3. Implement the pure projection.** Reuse `StageProgress.canOpen` for every continuation. Use per-plan `plannedUnitCounts` for fresh grouped runs and the saved checkpoint's count when resuming. Exclude unavailable actions, cap stage marks at three, and reset no durable state. Provide full accessible duration in addition to compact visible text.
- [x] **4. Run GREEN:** native projection tests and AppFoundation tests. Confirm no view body performs I/O and no new display type acquires write authority.

### Task 7: Native Stage Detail Layout and Shared Book Menu

**Files:** Create `App/Browsing/StageDetailHeader.swift`, `StageFamilyView.swift`, `BookManagementMenu.swift`, and `Tests/MediaIntegrationTests/StageDetailRenderingTests.swift`. Modify `StagePathView.swift`, `ProductTabsView.swift`, and the menu-only portion of dirty `BookCardView.swift`; preserve its approved two-line title/recovery layout. Extend `BrowsingInteractionTests.swift` as needed.

**Interfaces:** `StagePathView(summary:services:back:open:)` keeps `open: (Int) -> Void`, adds `services: ProductServicesModel?` and `back: () -> Void`. Shared `BookManagementMenu(summary:services:)` owns existing cancel/removal confirmation semantics. Keep `StageRow(stage:completions:checkpoint:enabled:open:tapFeedback:)` compatible with current tests; add defaulted presentation/disclosure inputs rather than weakening its launch guard.

- [x] **1. Write failing rendering/interaction tests** `coverStatisticsContinuationAndFamilyOrder`, `disclosureDoesNotLaunchOrHaptic`, `launchKeepsExistingHapticAndGuard`, `completionMarksStayThree`, `bookChangeResetsFamilyAndDisclosure`, and `longTitleLargestTextHasNoClippedActions`. Render at small/standard widths, both appearances, and the largest text size; assert distinct 44-point actions, visible three statistics, correct family denominator, and scroll reachability of all selected rows.
- [x] **2. Run RED:** native rendering and `BrowsingInteractionTests` selections. Retain rendered attachments for comparison with the owner's reference.
- [x] **3. Compose the stage page.** Use the existing cover asset, adaptive semantic surfaces, brand yellow, native back/menu buttons, wrapping title, statistics, continuation, family heading/ring, segmented picker, and eager accordion rows. First-family visible labels are `쉐도잉 1/2`, `순간암기 1/2`, `무자막 순간 1/2`; guidance describes current behavior. Use independent sibling controls, no nested buttons. Retain stage accessibility IDs `stage-1` through `stage-16`; add `stage-family-0/1/2`, `stage-continue`, `stage-guide-N`, `stage-study-time`, and `stage-back`.
- [x] **4. Wire routing and menu reuse.** Back selects Bookshelf without clearing book selection. Replace only the selected book's Stage status toolbar with its cover navigation; keep bottom browsing tabs and empty-state language selection. Existing `LearningEntry.prepare` remains the sole launch boundary. Share the existing confirmed download-only removal/cancellation menu without changing dirty bookshelf layout or history semantics.
- [x] **5. Run GREEN:** rendering/interaction tests plus existing book-card rendering tests, then a Debug build. Compare the new stage screen to the supplied reference, checking safe areas, readable cover chrome, text wrapping, and disabled-stage treatment. A screenshot is visual evidence, not proof of persistence.

### Task 8: Focused UI Regression, Catalog, and Final Verification

**Files:** Extend existing `Tests/AppUITests/ProductUITests.swift` with one consolidated stage/time journey; update `LearningPlayerActions.swift`, `PlayerUITests.swift`, `ReferenceToolsUITests.swift`, `ProductAccessibilityUITests.swift`, `VoiceOverSemanticsUITests.swift`, and `OfflineAcceptanceUITests.swift` only where selecting higher stages now requires the correct family. Update `App/Localizable.xcstrings`, `native-ios/README.md`, and `docs/learning-contract.md` for the approved behavior and backup compatibility.

**Interfaces:** Existing `openStage` UI helper becomes family-aware using the stage number and `stage-family-0/1/2`; callers keep their current stage IDs. No new UI test class/shard or routine launch flag is required.

- [x] **1. Write the failing UI journey** `testStageDetailFamiliesAndStudyTimeSurviveReopen`: verify stats and independent disclosure, select every family, launch a paused eligible lesson, open/close options, leave, relaunch with the same isolated profile, and verify a nonzero retained time statistic without XP. Keep long-duration inclusion/exclusion proofs in fake-clock tests rather than repeated wall-clock waits in UI tests. Update family-aware navigation before treating missing off-family rows as product failures.
- [x] **2. Run RED:** only `NativeFoundationUITests/ProductUITests/testStageDetailFamiliesAndStudyTimeSurviveReopen` and the existing largest-text stage/accessibility journey. Expected missing family-aware navigation or retained statistic.
- [x] **3. Complete app/catalog/docs integration.** Use localized user-facing strings and `bash native-ios/scripts/sync-string-catalog.sh` after building. Document version-6 backup update requirements, approximate crash-loss window, and exclusion rules. Preserve all existing accessibility audit categories, thresholds, profile isolation, and storage failure assertions.
- [x] **4. Run GREEN in proportion to risk:** all six host package suites; native storage/flow/projection/rendering and existing browsing/reference lifecycle suites; affected product/player/reference/offline/accessibility UI methods; unsigned Release build plus `verify-native-product.sh` and the existing runtime-inspection guard. Run `git diff --check`. No selected case may fail, skip, or silently disappear; report executed case counts from finalized results.
- [x] **5. Hand off evidence:** show the revised stage screen in the existing right-side simulator mirror if the owner has authorized that destination; otherwise ask before replacing a preview. Report which local tests passed, what remains unverified (physical lock and live private sync), and that no commit/push/PR occurred. Keep unrelated changes intact. Full native pre-push verification remains mandatory when a later PR request authorizes it.

## Execution Handoff

Recommended: direct execution in this session, because storage, backup, workspace, and lifecycle tasks share tightly coupled interfaces and benefit from one ordered implementer. Subagent-driven execution is available if the owner explicitly chooses its additional per-task review/context cost. Both methods require review of this plan first. No product code or migrations have been applied while writing it.
