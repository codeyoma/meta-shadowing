# Swift-native W3 Learning and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. The owner already chose sequential main-agent implementation, followed by independent whole-branch review. Do not reopen that choice or delegate implementation. Steps use checkbox syntax for tracking.

**Goal:** Resolve #94 with a deterministic sixteen-stage Swift learning engine, transactional SQLite progress storage, and tested interfaces for later media, UI and Apple-service work.

**Architecture:** Extend `LearningDomain` with validated value types and pure rules. Add an actor-owned `LearningPersistence` package using system SQLite, then a narrow `AppFoundation` controller that publishes committed snapshots and exposes media effects without implementing media. Keep resume selection separate from monotonic reward evidence, and keep each active writer pinned to its own predecessor.

**Tech Stack:** Swift 6 language mode, Swift Testing, system SQLite (`SQLite3`, no third-party database dependency), SwiftUI/XCUITest for the synthetic integration only, XcodeGen, Xcode 27 and iOS 27 Simulator.

**Published scope:** `docs/native-rebuild.md`, current `docs/learning-contract.md`, and GitHub issue #94 under #91. The owner-reviewed local migration design and roadmap informed this child plan; they are not included in this change.

Status: Owner-approved sequential implementation completed locally on 2026-09-28. Tasks 1–8 and the independent final review passed; sanitized verification evidence is in `docs/swift-native/learning-storage-contract.md`. #93's foundation and Swift-only CI landed in PR #100. The separately approved dev-merge issue-closure workflow is implemented and locally tested; it activates only after merge. The owner authorized commit, push and a feature PR into `dev` after acceptance. Merge and release remain separate actions.

## Global Constraints

- Keep all current product features and learning behavior. The current learning contract and explicit owner updates supersede historical M1 behavior.
- Follow native iOS conventions; keep the current iPhone-first iOS 26+ deployment scope. Verify on iOS 27, never silently fall back to iOS 26.5.
- Existing learning data is test data; migration of existing records is not a release requirement. Preserve supported backup decoding and future restore correctness, without scanning or importing a reference installation.
- Android will be a separate, later Kotlin-native implementation. No shared runtime, backend or Supabase.
- No performance measurements, improvement targets, live accounts, purchases, physical app replacement or release work in #94.
- No SwiftUI, AVFoundation, CloudKit, timers, filesystem access or implicit wall clock in `LearningDomain`. Inject identity and time at boundaries.
- Only committed state grants XP, completion or feedback. Cloud acknowledgement never gates local practice. Save errors pause practice and remain recoverable; ordinary saves stay quiet.
- Preserve unrelated dirty files, including existing local migration documents. Never read, modify, stage or remove the unrelated file named `-`.
- New feature work starts from latest `origin/dev` on `codex/swift-learning-storage`. Reuse the current checkout only when switching preserves all user changes; otherwise use an approved managed worktree. No history rewriting or remote protection changes.
- This plan does not authorize committing, pushing or merging. Retain task-sized changes for a later authorized publication; inspect exact staged paths and public-safe evidence before publishing.
- Hosted app CI remains Swift-only. A one-time local TypeScript oracle may generate synthetic fixtures; no npm installation or Expo checks are added to hosted CI or the Swift product.

## Review Focus

1. A repeated tap or old transport/profile callback must not confirm a different cycle: Tasks 2, 5 and 7 pin identity, predecessor version and duplicate-command tests.
2. A failure before commit, or a lost response after commit, must neither lose committed work nor duplicate XP: Task 5 tests real SQLite faults and Task 7 tests publication/retry.
3. Concurrent regrouped plans must preserve completed source cycles and count overlapping rewards once: Tasks 3, 4 and 6 test all group sizes and merge permutations.
4. Restore, date boundaries and preference changes must not become new practice or reopen a completed reveal: Tasks 3, 4 and 6 test midnight, DST, absent legacy fields and restore.
5. Malformed or oversized backup input must leave every existing row intact; old resume data must not lower reward evidence: Tasks 5 and 6 verify disk reopen, bounded decoding and atomic batches.

---

## File and ownership map

All paths below are relative to the worktree root. Existing preview types remain intact.

- `native-ios/Packages/LearningDomain/Sources/LearningDomain/`: `LearningIdentity.swift`, `LearningPlan.swift`, `LearningSession.swift`, `LearningReducer.swift`, `LearningNavigation.swift`, `LearningRegrouping.swift`, `LearningText.swift`, `RevealTimeline.swift`, `LearningPreferences.swift`, `LearningRewards.swift`, `LearningProgress.swift`, `LearningBackup.swift`, `LearningBackupCodec.swift`, `LearningBackupMerge.swift`, `LearningStore.swift`.
- `native-ios/Packages/LearningDomain/Tests/LearningDomainTests/`: corresponding focused test files named in the tasks, `ReferenceTraceTests.swift`, and `Fixtures/learning-reference.json`, `Fixtures/backup-reference.json`.
- `native-ios/Packages/LearningPersistence/`: `Package.swift`; `Sources/LearningPersistence/{SQLiteConnection,LearningSchema,SQLiteLearningStore,LearningTransactions,LearningBackupStorage}.swift`; `Tests/LearningPersistenceTests/{SQLiteLearningStoreTests,LearningTransactionTests,LearningBackupStorageTests,SQLiteTestSupport}.swift`.
- `native-ios/Packages/AppFoundation/`: controller and synthetic workspace integration, consuming the domain protocol and concrete persistence at composition only.
- `native-ios/App/`: an explicitly synthetic Debug-only storage probe, not the W5 production learning UI.
- `scripts/swift-learning-reference.ts`: local, deterministic reference-fixture generator; no reference application source edits.
- `docs/swift-native/learning-storage-contract.md`: stable producer/consumer interfaces, storage invariants and sanitized acceptance evidence.
- `native-ios/{README.md,project.yml}`, package manifests, `.github/workflows/ci.yml` and `docs/native-ci.md`: wire new tests/dependencies without changing required checks or release policy.

## Contract decisions shared by all tasks

Public domain values are `Sendable` and `Equatable`; durable/wire values use validated `Codable` decoding rather than trusting synthesized decoding. Identifiers are explicit values, not file paths. Use integer arithmetic with checked bounds for counts, revisions and XP.

- `LearningScope`: profile ID, versioned package key, language ID, book ID and stage (1...16). A different package version is a different progress identity.
- `LearningPlan`: scope, plan/run ID, optional root lineage ID, source count, group size, and source members. Regrouping creates a new plan ID; a genuinely new practice run creates a new lineage.
- `LearningSession`: plan, selected unit, per-unit and optional per-source confirmed/planned/closed progress, phase (`ready`, `listening`, `speaking`, `decision`, `complete`), running flag, playback rate, position seconds and optional reveal speed/WPM. Native names need not mirror JSON keys; the backup codec owns that translation.
- `LearningEvent`: resume, pause, position(seconds), playbackEnded, confirm, repeat, next, selectSource(index), changeRate(rate), changeRevealSpeed(level, presets), regroup(size, newPlanID), and stageEntry. Media callbacks never carry an XP amount.
- `SessionTransition`: validated next session, newly confirmed source ordinals, whether a full lineage completed, and transport intents. Its initializer is internal; persistence recomputes transitions from its pinned predecessor, not caller-supplied reward totals.
- `TransportIntent`: stop, prepare(unit, position, rate, delayMilliseconds), restoreFrame(unit, rate), or reveal(unit, elapsedSeconds, WPM). W4 owns executing/cancelling these intents; W3 tests values only. No audio preparation for stages 11...16.
- `LearningHandle`: opaque writer ID plus scope and current plan ID. `LearningCommand` carries that handle, a unique command ID, expected writer version and an event. Writer versions order durable commands; they are not transport generations.
- `TransportToken`: writer ID, plan ID, unit index, cycle ordinal and generation. `TransportRequest` pairs this token with a transport intent; `LearningCallback` pairs it with a position or playback-ended event. The controller validates the token before creating a command against the current writer version. Position saves do not invalidate a still-active transport; pause, replacement, navigation, rate/regroup changes and disposal do.
- `LearningSnapshot`: handle, writer version, session and language progress. `CommitReceipt`: snapshot, backup revision, newly earned XP and disposition (`applied`, `duplicate`, `ignored`). A duplicate never reports new XP or feedback.
- `LearningStore: Actor`: the protocol lives in the domain package; SQLite is one implementation. No SQL, database handles, mutable rows or concrete SQLite type leaks to views/media/services.

### Task 1: Validated plans and independent reference cases

**Files:** Create `LearningIdentity.swift`, `LearningPlan.swift`, `LearningPlanTests.swift`, `ReferenceTraceTests.swift`, both fixture files and `scripts/swift-learning-reference.ts`; modify the domain `Package.swift` to copy fixture resources.

**Interfaces:** Produce `LearningPlan.make(scope: LearningScope, runID: String, sources: [LearningSource], groupSize: Int) throws -> LearningPlan`, `LearningSource(index: Int, text: String, translation: String)`, and `StagePolicy.forStage(_ stage: Int) throws -> StagePolicy`. Policy exposes grouped/hint/reveal mode and default planned cycles. Reference fixtures contain input, actions, per-action expected public state, expected rewards and reference revision; no private lesson data.

- [x] **RED:** Add `plansCoverAllSixteenStages`, `partialGroupRemainsSeparate`, and `invalidPlansAreRejected`. Assert stages 7...10 group by 2/3/4, five sources at size 2 produce `[[0,1],[2,3],[4]]`, all other stages use single sources, stages 5/6/9/10 use hints, audio defaults to 3 cycles and silent defaults to 1. Reject stages 0/17, empty/duplicate source identities, invalid group sizes and source counts above 100000.
- [x] Run `swift test --package-path native-ios/Packages/LearningDomain --filter LearningPlanTests`; expect missing new types/tests to fail before implementation, not a toolchain error.
- [x] Implement the exact plan/policy interfaces and strict validation; use immutable source ordering. Source text may contain multiple sentences and still represents one original learning block.
- [x] Build the local oracle using the existing `tsx` and Node SQLite test adapters. Consume `session`, `learning-units`, `regroup-session`, `word-reveal`, `journal`, `progression` and backup reference APIs; generate only synthetic inputs with fixed IDs/time. Run `node --import tsx scripts/swift-learning-reference.ts --check`; failure reports stale/missing fixtures, while explicit `--write` regenerates only the two named fixture files. Mechanically generated fixture updates are permitted; hand-authored source uses `apply_patch`.
- [x] Run the plan tests and fixture `--check`; expect PASS and deterministic byte-identical fixture generation. Review fixture assertions against the owner-approved contract, not only the old implementation. Tasks 2...6 add cases to these same fixtures as their behavior is ported.

### Task 2: Manual session transitions, navigation and interruption intent

**Files:** Create `LearningSession.swift`, `LearningReducer.swift`, `LearningNavigation.swift`, the initial `LearningPreferences.swift`, `LearningSessionTests.swift`, `LearningNavigationTests.swift`; extend `ReferenceTraceTests.swift` and the learning fixture.

**Interfaces:** Consume Task 1 plans. Produce `LearningSession.start(plan: LearningPlan, preferences: LearningPreferences) throws -> LearningSession`, `LearningReducer.reduce(_ state: LearningSession, event: LearningEvent) throws -> SessionTransition`, and `LearningSession.validatedForRestore(expected: LearningScope, sourceCount: Int) throws -> LearningSession`. Introduce the minimal preferences defaults here; Task 3 finishes their validation and persistence representation.

- [x] **RED:** Add `endedPlaybackDoesNotAwardOrAdvance`, `thirdCycleChoicesWaitForPlaybackEnd`, `repeatAddsOnlyFourthAndFifthCycles`, `nextConfirmsFinalCycleOnce`, `navigationDoesNotConfirm`, `lastUnitReturnsToEarlierGap`, and `restoreIsPaused`. Assert exactly 3 normal cycles, Repeat adds exactly 2, audio end awards 0, and completion requires every planned cycle of every unit.
- [x] Run `swift test --package-path native-ios/Packages/LearningDomain --filter 'LearningSessionTests|LearningNavigationTests|ReferenceTraceTests'`; expect missing reducer behavior to fail.
- [x] Implement reducer/navigation with deterministic no-ops for unavailable choices and errors for malformed numeric/identity inputs. Preserve legacy 7/9-cycle plans on restore without offering another Repeat. Restore pauses; stageEntry replays an ended, unconfirmed audio pass from zero but preserves interrupted listening position. Completed 3/5-cycle decisions never autoplay.
- [x] Add `entryAndNavigationDelayButRepeatDoesNot` and `pausedSpeedEditPreservesPosition`. Assert audio stage entry/new unit prepare delay is 1000 ms, another cycle has 0 ms, rate range is 0.25...3, fine-grained valid saved rates remain readable, and a running speed edit fails. Foreground/options dismissal emits no resume intent.
- [x] Re-run the focused suites and reference `--check`; expect PASS for every stage 1...10, duplicate choices, out-of-order unit visits and incompatible package/stage/count checkpoints. No media runtime or timers are introduced.

### Task 3: Regrouping, text visibility, silent reveal and preferences

**Files:** Create `LearningRegrouping.swift`, `LearningText.swift`, `RevealTimeline.swift`, `LearningRegroupingTests.swift`, `LearningTextTests.swift`, `RevealTimelineTests.swift`, `LearningPreferencesTests.swift`; complete `LearningPreferences.swift` and extend reference fixtures and reducer events.

**Interfaces:** Produce `LearningRegrouping.apply(_ state: LearningSession, size: Int, newPlanID: String) throws -> LearningSession`, `LearningText.firstWordHint(_ text: String) -> String`, `RevealTimeline.lines(source: LearningSource, stage: Int) throws -> [RevealLine]`, `RevealTimeline.visible(lines: [RevealLine], seconds: Double, WPM: Int, completed: Bool) throws -> [RevealLineVisibility]`, and `LearningPreferences.fresh`. Preferences preserve optional legacy fields; their wire decoder normalizes old auto mode to manual without fabricating absent typography values.

- [x] **RED:** Add `regroupPreservesSourceOrdinalsAcrossEverySize`, `closedSourcesNeverReopenOnRepeat`, `regroupRequiresPausedNewIdentity`, `silentOrderAndWhitespaceAreStable`, `speedChangePreservesPartialWord`, `silentRestoreKeepsCompletedReveal`, and `fontResetDoesNotResetSize`. Run `swift test --package-path native-ios/Packages/LearningDomain --filter 'LearningRegroupingTests|LearningTextTests|RevealTimelineTests|LearningPreferencesTests'`; expect failures in the new behavior.
- [x] Implement immutable regrouping: preserve root lineage and source cycles; reset transport position to zero while paused; select the new group containing the old first source, then skip completed groups. Mixed groups replay context but confirm only unfinished sources. Same-size requests are no-ops; source completion stays closed even when the remaining members add two cycles.
- [x] Implement whitespace-token reveal with punctuation/layout preserved: target then translation for 11/12, translation then target for 13/14, translation only for 15/16. Defaults are `[150,200,250,300]` WPM; valid presets are integer 1...999. Preserve fractional words on speed change (`newSeconds = oldSeconds * oldWPM / newWPM`). For example, 0.2 seconds at 150 becomes 0.1 seconds at 300; hidden content stays out of `visibleText`.
- [x] Implement one-pass silent confirmation: no Repeat, 3 XP intent per newly confirmed phrase, next unfinished unit forward then wrap, no audio-delay intent. Restored legacy incomplete silent units need one remaining pass; completed units and old receipt values are unchanged. Zero-word duration follows the reference minimum of one word; reject nonfinite timeline inputs.
- [x] Complete profile preference values: rate, group size, bubble/list, four WPM presets, source/translation fonts and sizes; selection stores language/book/versioned package. Fresh typography is 20/18 and System; sizes are integers 12...48; preserve unavailable stored font choices for later UI fallback. Test every existing font identifier, absent legacy fields, explicit resets and active-run speed/group edits that do not mutate global defaults.
- [x] Verify all focused suites and reference traces pass. Include Korean, Japanese, punctuation-only text, titles/initials/decimal first-word hints, Unicode whitespace and partial final groups.

### Task 4: Reward receipts, progression and convergent evidence

**Files:** Create `LearningRewards.swift`, `LearningProgress.swift`, `LearningRewardsTests.swift`, `LearningProgressTests.swift`; extend fixtures.

**Interfaces:** Produce `RewardLedger.record(transition: SessionTransition, day: StudyDay) throws -> RewardLedger`, `RewardLedger.merged(with: RewardLedger) throws -> RewardLedger`, `RewardLedger.totalXP(language: String) throws -> Int64`, `LevelProgress.forXP(_ xp: Int64) throws -> LevelProgress`, `StudyDay.at(_ date: Date, calendar: Calendar) throws -> StudyDay`, and `StageProgress.canOpen(stage: Int, completedRuns: [Int: Int], verifiedTestAccess: Bool) -> Bool`. Ledger records plan identity, source-cycle ordinals, observed counts, historical opaque credit candidates and original study days; do not flatten imported evidence into a new award.

- [x] **RED:** Add `sourceReceiptsCreditExactlyOnce`, `concurrentRegroupMergeConverges`, `newRunHasIndependentCredit`, `silentReceiptsUseThreeWithoutRepricingHistory`, `levelBoundariesMatchReference`, `streakUsesSuccessfulLocalSaveDay`, and `threeFullRunsUnlockNextStage`. Run `swift test --package-path native-ios/Packages/LearningDomain --filter 'LearningRewardsTests|LearningProgressTests'`; expect failures before the implementation.
- [x] Implement receipt identity by scope/lineage/source/ordinal for provable new work; retain raw per-plan evidence and historical opaque baselines for compatibility. Deduplicate overlap before the language cap `2147483647`; never subtract already valid historical credit. New completion rewards are zero, not the historical 10 XP bonus. Group XP equals actual newly advanced source members; silent XP is 3 per new phrase. Completion count deduplicates a regrouped lineage.
- [x] Implement level increments from the unrounded curve `round(100 * 1.0053^(level-1) / 10) * 10` for levels 1...998; carry surplus. Assert all 998 boundaries against reference values and level 999 at 3669390 XP. Checked intermediate arithmetic prevents overflow even with many capped imported runs.

  Exact public assertions in `levelBoundariesMatchReference` and `threeFullRunsUnlockNextStage` include:
  ```swift
  #expect(try LevelProgress.forXP(99).level == 1)
  #expect(try LevelProgress.forXP(100).level == 2)
  #expect(try LevelProgress.forXP(3_669_390).level == 999)
  #expect(!StageProgress.canOpen(stage: 2, completedRuns: [1: 2], verifiedTestAccess: false))
  #expect(StageProgress.canOpen(stage: 2, completedRuns: [1: 3], verifiedTestAccess: false))
  ```
- [x] Implement language-isolated streaks from durable practice days, including zero-new-XP completed practice. Assert yesterday remains visible, one missing day breaks the streak, midnight/DST/calendar-zone changes use injected time, and restore alone adds no day. Stage access requires three complete predecessor runs for stages 2...16; verified test access changes access only, never history or stars.
- [x] Verify all suites and reference fixture equality. Merge tests assert idempotence, commutativity and associativity across size-2/3/4 branches, optional cycles, late legacy evidence, different resume cursors and same receipt on different days; incompatible identity or weight fails.

### Task 5: Actor-owned SQLite commits, profiles and recovery

**Files:** Create `LearningStore.swift`; the new persistence package, its first four source files and `SQLiteLearningStoreTests.swift`, `LearningTransactionTests.swift`, `SQLiteTestSupport.swift`. Modify domain manifests only as needed for tests; no database dependency enters the domain.

**Interfaces:** Define the Task 1...4 values through the domain protocol:

```swift
func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) async throws -> LearningSnapshot
func apply(_ command: LearningCommand) async throws -> CommitReceipt
func readProgress(scope: LearningScope, today: StudyDay) async throws -> LearningProgress
func preferences(profileID: String) async throws -> ProfilePreferences
func savePreferences(_ value: ProfilePreferences, profileID: String) async throws -> Int64
func revoke(profileID: String) async
```

`SQLiteLearningStore(root: URL, now: @escaping @Sendable () -> Date, calendar: Calendar)` implements the protocol. `ProfilePreferences` contains Task 3 learning settings and library selection. `LearningProgress` contains language XP/level/streak, stage completion counts and latest learning selection independent of library browsing. `open` restores a compatible unfinished checkpoint when present; otherwise it starts the supplied fresh plan without inventing rewards. A completed checkpoint remains history, not an unfinished resume. Initialization does no main-actor I/O; opening happens inside the store actor. The injected root is exclusively the new app's storage namespace.

- [x] **RED:** Create real in-memory and temporary disk SQLite tests. Assert profile A/B isolation, a quoted/path-like profile ID cannot escape the root, independent package versions, save/load/reopen equality, paused restoration, and corrupt/schema-too-new databases fail without erasure. Run `swift test --package-path native-ios/Packages/LearningPersistence`; expect the new package/types to be absent before creation, then assertion failures until implemented.
- [x] Implement system SQLite connection ownership, prepared statements, checked bind/step/finalize/close, WAL, `synchronous=FULL`, foreign keys and a versioned schema in the actor. Use hashed profile-directory keys, never raw profile IDs as paths. No database call or `await` inside another actor's transaction; transactions themselves contain no suspension points. No reference-app migration or auto-delete recovery.
- [x] Implement atomic tables for checkpoints, completion lineages, reward evidence/projections, study days, preferences, ordering clocks, backup revision/acknowledgement, accepted command IDs and reset generation. Constraints bind records to the profile/package/stage/run identity. `BEGIN IMMEDIATE` encloses all writes and `COMMIT` precedes success publication; rollback preserves the previous committed state.
- [x] Implement writer leases with pinned predecessor snapshots and monotonically increasing writer versions. Recompute domain transitions from the lease, reject mismatched profile/package/plan/version, and revoke leases on profile disposal. Persist command ID plus canonical payload identity with meaningful mutations; repeated commands return `duplicate` with zero new XP, mismatched reuse fails. A lost reply after commit can be retried/read back without reapplying work. No-op/duplicate changes do not increment backup revision.
- [x] **Fault tests:** `everyCommitBoundaryRollsBack` injects SQL trigger failures during receipt, completion, checkpoint and revision writes, plus a controlled pre-COMMIT failure. Assert checkpoint, receipts, XP, study days, completion count and revision equal the before-snapshot; reopen the file to verify durability. Remove the fault, retry the same final confirmation twice: one completion, one reward, one revision increment. `lostCommittedReplyDoesNotRepeatReward` discards the first successful reply before retry; `revokedWriterCannotCommit` exercises queued stale events.
- [x] Verify the persistence suite passes, including busy/locked and read-only failure cases with bounded retry/error propagation. Fault hooks remain internal test seams; tests never touch app, reference or account storage. Record success only after disk reopen and a real SQL inspection through test-only helpers.

### Task 6: Bounded backup codec, atomic restore and merge

**Files:** Create `LearningBackup.swift`, `LearningBackupCodec.swift`, `LearningBackupMerge.swift`, `LearningBackupTests.swift`, persistence `LearningBackupStorage.swift` and `LearningBackupStorageTests.swift`; extend backup fixtures.

**Interfaces:** `LearningBackupCodec.decode(_ data: Data) throws -> LearningBackup`, `encode(_ backup: LearningBackup) throws -> Data`, `LearningBackup.merged(with: LearningBackup) throws -> LearningBackup`. Extend `LearningStore` with `exportBackup(profileID: String) async throws -> BackupSnapshot`, `mergeBackup(_ data: Data, profileID: String) async throws -> BackupSnapshot`, `restoreIntoEmptyProfile(_ data: Data, profileID: String) async throws -> BackupSnapshot`, and `acknowledgeBackup(profileID: String, revision: Int64) async throws`. `BackupSnapshot` contains canonical payload, revision, acknowledged revision and reset generation. Reset-generation transport/remote deletion remains W7; W3 preserves the marker and rejects mismatched ordinary merges.

- [x] **RED:** Add `supportedBackupVersionsNormalizeWithoutRewards`, `oversizedOrMalformedBatchDoesNotMutate`, `mergeOrdersConverge`, `oldResumeCannotLowerEvidence`, `activeWriterKeepsPinnedPredecessor`, and `acknowledgementCannotPassRevision`. Run `swift test --package-path native-ios/Packages/LearningDomain --filter LearningBackupTests` and `swift test --package-path native-ios/Packages/LearningPersistence --filter LearningBackupStorageTests`; expect missing codec/storage behavior to fail.
- [x] Implement exact v1...v4 reference wire decoding and v4 canonical export, including compact count arrays, legacy manual normalization, historical awards and source-cycle lineage. Accept only bounded fields/identities/valid dates and cross-record-consistent shapes. Enforce the 16 MiB UTF-8 envelope, 4 MiB checkpoint strings and 100000-entry/count limits before expansion or mutation; reject duplicate keys/identities, conflicting plans and invalid completed-state evidence.
- [x] Implement deterministic merge of receipt evidence separately from last-writer-ordered resume/preferences using the reference logical clock and tie-break rules. Clock rollback cannot reverse ordering. Preserve original study dates and opaque rewards; no reward or haptic event is produced by import. Late remote resume can win the slot without replacing an active writer's pinned predecessor; passive saves cannot steal it back.
- [x] Implement snapshot reads and restore/merge writes inside real SQLite transactions. Validate every input before mutation; reject replacement of a different nonempty profile, no-op identical payloads, and increment revision only for a changed durable result. Baseline fresh defaults are durable but not a pending user edit. Acknowledgements are monotonic and bounded by the stored revision. Export is a local snapshot only, never a cloud upload or reset.
- [x] Verify golden v1...v4 fixtures, repeated imports, failed batch/retry, changed preference stamps, hidden/unfinished silent reveal, all group sizes, maximum permitted compact arrays, malformed expansion and disk reopen. Assert import retains incoming receipts but synthesizes no additional practice/reward receipt, adds no new current-day practice, and leaves a running lease usable for genuinely new confirmation.

### Task 7: Committed-state controller and synthetic shell proof

**Files:** Under `native-ios/Packages/AppFoundation/`, create `Sources/AppFoundation/LearningController.swift`, `Sources/AppFoundation/SyntheticLearningWorkspace.swift`, `Tests/AppFoundationTests/LearningControllerTests.swift`, `Tests/AppFoundationTests/SyntheticLearningWorkspaceTests.swift` and modify `Package.swift`; modify `native-ios/App/MetaShadowingApp.swift` and `native-ios/Tests/AppUITests/NativeFoundationUITests.swift`; create `native-ios/App/SyntheticLearningProbeView.swift`. Keep `PreviewLessonView.swift` unchanged; the conditional Debug root isolates the storage probe.

**Interfaces:** `LearningController` is an actor consuming `any LearningStore`; `send(_ command: LearningCommand) async -> LearningControllerState`, `receive(_ callback: LearningCallback) async -> LearningControllerState`, `retrySave() async -> LearningControllerState`, and `deactivate() async` own the pending command, transport token and publication generation. `LearningControllerState` exposes the last committed snapshot plus paused/save-failed status and accepted transport requests. A failed candidate remains private for retry; views never see provisional XP/completion. `SyntheticLearningWorkspace` composes the concrete store with fixed public sample content and injected root/time.

- [x] **RED:** Test `failedSavePublishesNoRewardAndBlocksNextAction`, `retryCommitsWithoutAutoplay`, `deactivationDiscardsLateReply`, `oldProfileAndTransportGenerationCannotAdvance`, `positionSaveDoesNotInvalidateCurrentTransport`, and `remoteResumeDoesNotReplaceActivePredecessor`. In the transport pair, two position updates and the end event from one live token succeed, while an end event from a replaced token changes neither phase nor XP. Run `swift test --package-path native-ios/Packages/AppFoundation --filter 'LearningControllerTests|SyntheticLearningWorkspaceTests'`; expect failures before implementation.
- [x] Implement single-writer sequencing without actor-reentrancy races: do not accept another command while one is awaiting persistence. On save failure stop transport immediately, retain the pending operation, publish an actionable save error with unchanged committed progress, and allow retry or safe teardown. Retry reuses the command ID; lifecycle invalidation blocks late publication without pretending a committed operation rolled back. Neither retry nor foreground starts playback.
- [x] Add a Debug-only, clearly labeled storage probe reachable via `--ui-test-learning-storage`. It drives a synthetic stage-11 reveal completion and explicit confirmation, not fake audio playback. Show unit progress and XP, persist them, terminate/relaunch with the same probe root, and restore. Release retains the sample shell and gains no mock media controls. No full W5 player screen, live cloud or account path is claimed.
- [x] Extend XCUITest with `testSyntheticLearningSurvivesRelaunch`: confirm one synthetic phrase, assert 3 XP and one completed unit, relaunch, assert unchanged XP/progress and no implicit confirmation. Keep existing navigation, foreground, large-text and failure/retry tests. Test fixture reset may affect only the dedicated probe's injected temporary profile.
- [x] Run AppFoundation tests and iOS 27 XCUITest using the existing dedicated simulator and fictional CI configuration; all tests must pass. Verify Debug probe hooks are absent from the Release product and the reference/physical installations remain untouched.

### Task 8: Swift CI, consumer documentation and acceptance review

**Files:** Modify `.github/workflows/ci.yml`, `native-ios/README.md`, `docs/native-ci.md`, `native-ios/project.yml` only where dependency wiring requires it; create `docs/swift-native/learning-storage-contract.md`. Do not stage pre-existing untracked roadmap/spec/evidence files incidentally.

**Interfaces:** CI adds `swift test --package-path native-ios/Packages/LearningPersistence` to `ci-quality`. Document Task 5/6/7 signatures, handle/version invalidation, transaction invariants, backup limits and W4 media ownership. Preserve all four required job names, Xcode 27/iOS 27, CI's fictional identity and the existing human release gate.

- [x] Run all three Swift package suites and the local reference `--check`. Confirm tests cover every #94 acceptance item; no task is checked off because a fixture merely compiled or a service check was skipped.
- [x] Run `actionlint`, `node --test scripts/check-branch-policy.test.mjs`, and `bash native-ios/scripts/test-ci-configuration.sh`; expect no workflow errors, policy regressions or local-identity dependencies.
- [x] Generate with `xcodegen generate --spec native-ios/project-ci.yml`; run existing documented Debug UI tests and Debug/Release builds with `CODE_SIGNING_ALLOWED=NO` on iOS 27. Run `native-ios/scripts/verify-native-product.sh` on both products. Confirm SQLite links natively and no Expo/React Native/JavaScript runtime is embedded.
- [x] Conduct independent whole-branch review using `superpowers:requesting-code-review`, focusing on the five failure modes above and public actor boundaries. Fix actionable findings and rerun affected tests. Do not delegate implementation; review is the previously approved exception.
- [x] Update only sanitized evidence with actual commands, outcomes and remaining W4/W5/W7 boundaries. `git diff --check` must pass. Inspect the exact changes for private identities, user paths, account data, generated projects and unrelated dirty files. No performance or full-rewrite completion claim.
- [ ] At a later authorized PR publication, target `dev`, include `Closes #94` only after the ticket's acceptance criteria pass, and attach the PR to the task. PR creation is not issue completion; the separately reviewed workflow will close it on verified merge into `dev`. Do not merge or close unrelated prerequisite issues automatically.

## Self-review and owner handoff

Checked the plan against W3, the approved architecture and current learning contract: stage rules/text/reveal map to Tasks 1...3; rewards/dates to Task 4; atomic storage/profiles to Task 5; restore/merge compatibility to Task 6; lifecycle publication and the shell proof to Task 7; CI/evidence/interfaces to Task 8. Media execution, finished screens, live services, reset orchestration and release remain explicitly downstream.

The eight tasks define one-way producer/consumer interfaces and attach tests to all five review-focus risks. No existing-data migration or hosted reference CI is reintroduced. Independent review found seven actionable boundary issues; all were fixed with regressions and rechecked. There are no unresolved review blockers within W3. Publication below remains a separate owner-authorized action, not an unfinished implementation task.
