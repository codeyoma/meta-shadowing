# Swift-native verification and controlled cutover implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan sequentially. Use `tdd` at the seams below and `code-review` before the final implementation commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve native feature-parity gaps, assemble honest functional evidence, and replace only an explicitly approved test installation when its acceptance gates pass.

**Architecture:** Keep the existing six Swift packages and app composition. Audit the retained reference against native public behavior, add focused regression coverage, and fix demonstrated gaps without a new runtime or migration framework. Separate automated verification from physical hardware, live Apple services, and the final installation decision.

**Tech Stack:** Swift 6, SwiftUI/UIKit, SQLite, AVFoundation, StoreKitTest, Swift Testing, XCTest/XCUITest, XcodeGen.

**Spec:** Owner-approved `docs/superpowers/specs/2026-09-27-swift-native-migration-design.md`, its sequential roadmap, and GitHub issue #99. Current owner amendments supersede historical requirements: no performance measurements, no manual VoiceOver testing, Swift-only hosted application CI.

**Status:** Approved for sequential local execution by the owner on 2026-09-29. Physical replacement, account access, and reset scopes remain separately gated.

## Global constraints

- Preserve all current product capabilities and explicit-confirmation learning rules. Native interaction conventions need not reproduce reference geometry.
- Keep deployment at iOS 26.0 and verify on iOS 27 Simulator. Android is later Kotlin-native work.
- No benchmark collection, performance thresholds, or numerical improvement claims.
- Preserve reference source, Git history, authoring tools, and unrelated dirty files. No reference-runtime deletion is part of this implementation pass.
- A fresh local store starts with sync disabled. Restoring, reopening, media completion, and duplicate callbacks do not earn credit.
- No implicit account access, real purchase, app uninstall, data reset, CloudKit schema deployment, TestFlight upload, or public release.
- Manual VoiceOver testing is excluded by the owner. Keep accessible labels, hidden-text boundaries, Dynamic Type, Reduce Motion, and touch-target checks.
- Keep device/account identifiers, private content, signed URLs, binary archives, and raw device evidence local and ignored. Publish only sanitized procedures/results.
- A fixture pass is not physical or live-service acceptance. Pending checks remain pending, even when prerequisite implementation tickets are closed.
- The `implement` request authorizes scoped commits on the current branch, not push, merge, or release. Do not stage unrelated drafts.

## Baseline and workspace

PR #107 is merged into `dev` at `1096342`. The current branch head is `5cc59aa`; its tracked tree matches that merge. Preserve the current checkout and branch unless the owner requests a branch change. Pin `1096342` as the review base; do not reset or stash unrelated work.

Latest verified baseline: 337 package tests, 96 native behavioral tests, one StoreKit setup check, and all required hosted PR checks passed. These are dated baseline observations, not #99 completion evidence.

The local W1 inventory has 48 feature IDs across 11 families and still marks every row unverified. It and several umbrella documents are untracked drafts. Read them as inputs, but do not overwrite, stage, or introduce CI dependencies on them. Publish a standalone native acceptance matrix instead.

Read the current learning, storage, media, product UI, reference-tools, Apple-services, and native-CI contracts before changing their consumers. #103 owns deferred hardware checks. The #98 closing comment lists the outstanding live-service checks.

## Agreed test seams requested by this plan

1. Normal app UI: Books, Stages, Settings, player actions, reference sheets, and visible service controls through XCUIApplication.
2. Native lifecycle: `LearningFlow.open(packageKey:stage:)`, `suspend()`, `close()`, runtime coordinator actions, and observable committed state using actual SQLite.
3. Service ownership: `ProductServicesModel.setActive(_:)`, explicit confirmations/actions, and profile/store public interfaces; controlled external transport only.
4. Built product: the existing `verify-native-product.sh` boundary, not source-text assertions about framework names.
5. Designated physical installation and real services: separately authorized manual journeys, never substituted by mocked results.

Approval of this plan confirms these seams. Use one test/minimal fix at a time. Where existing behavior already passes, record coverage rather than inventing a failing requirement or refactoring unnecessarily.

## Review focus

1. Fixture-only service success must not be promoted to real-service acceptance: Tasks 1 and 5 keep evidence tiers separate.
2. Repeated exit/reentry or a late callback must not revive a retired player, observer, or writer: Task 2 checks inactive state and unchanged credit.
3. A fresh/offline profile must not publish empty history or resume media automatically: Tasks 2 and 3 assert durable state and disabled sync.
4. Long purchase labels, large text, dark appearance, and reduced motion must not hide actions or leak learning hints: Task 3 verifies normal controls and protected text.
5. Replacing the wrong installation or promising recoverable Swift progress from an old binary is unsafe: Task 5 requires exact local scope, a recoverable reference, and explicit final approval.

## Task 1: Establish the current native parity and acceptance matrix

**Files:** Create `docs/swift-native/cutover-matrix.md` and `docs/swift-native/cutover-acceptance.md`. Read the W1 inventory, current reference source, native contracts, #99 and #103 without changing their historical evidence.

**Consumes:** The 48 stable W1 feature IDs and current owner-approved learning behavior.
**Produces:** One row per feature with native source/test pointers, separate automated/device/live-service status, dated evidence, and a concrete remaining action.

- [x] Compare all 48 reference behaviors with the native implementation. Validate pointers against actual source and test bodies; existing test names alone are not proof of parity.
- [x] Classify each row as implemented, partial, or missing independently of evidence. Evidence values are `passed`, `pending`, `blocked`, or `not-applicable` with a reason; never derive acceptance from issue closure.
- [x] Record known checks explicitly: long localized prices, service-screen Reduce Motion, appearance, #103 hardware journeys, and #98 live-service journeys. Preserve the earlier launch-haptic owner result as historical evidence only.
- [x] Audit currently unconditional sample badges against paid content and audit gated developer tools against the reference. Do not silently waive a missing capability or invent new paid/free product semantics.
- [x] For each demonstrated gap, record the expected public behavior, owning native file, and focused regression test before fixing it. A newly discovered architecture or product-policy decision returns to the owner; it is not permission for an unrelated rewrite.

## Task 2: Verify repeated lifecycle and authority transitions

**Files:** Extend `native-ios/Tests/MediaIntegrationTests/NativeLifecycleTests.swift`, `ReferenceLifecycleTests.swift`, and `native-ios/Packages/AppFoundation/Tests/AppFoundationTests/ProductServicesModelTests.swift` only where the matrix finds missing scenarios. Fix the corresponding existing runtime/service owner only after reproducing a defect.

**Consumes:** Existing `LearningFlow`, `NativeLearningRuntime`, `SQLiteLearningStore`, `ProductServicesModel`, and controlled transport fixtures.
**Produces:** Regression coverage through existing public actions; no new production teardown/testing API.

- [x] Add `repeatedCloseAndReopenKeepsRetiredRuntimesInactive()` using three consecutive open/resume/close sequences. Assert each retired controller remains inactive, each replacement starts paused, and the public stored checkpoint/credit remains unchanged without confirmation.
- [x] Add `lateReferenceResultAfterCloseCannotReopenReplacement()` using the existing deferred access pattern. Close the old flow, open its replacement, release the old response, and assert no old analysis/dictionary state appears, replacement stays paused, and XP remains zero.
- [x] Add `repeatedServiceForegroundCyclesRejectOldConfirmations()` at the service model seam. Capture a confirmation, deactivate/reactivate, submit the stale confirmation, and assert no local/cloud deletion and no new upload; the current profile remains usable.
- [x] Run each case before altering production code. If it already passes, retain the useful coverage without an artificial failure. For actual defects, demonstrate RED and apply the smallest production correction, then rerun the affected package/native test target.
- [x] Use condition-based bounded waits and real SQLite checkpoints. Count event/transport ownership only where it is an observable external boundary, not private task-array sizes or memory measurements.

## Task 3: Close end-to-end UI and accessibility evidence gaps

**Files:** Extend `native-ios/Tests/AppUITests/AppleServicesUITests.swift`, `ProductAccessibilityUITests.swift`, and `PlayerUITests.swift`; use existing Debug-only catalog/service fixtures. Narrow production fixes belong in the affected existing browsing, player, or settings view.

**Consumes:** Existing UUID-scoped UI profiles, bundled public audio, analysis fixtures, normal purchase/download controls, and the local StoreKit setup scheme.
**Produces:** UI evidence for reachable actions, durable recovery, and hidden-text safety under the required system settings.

- [x] Add `testInstalledLessonReopensWithoutServiceAccessOrExtraCredit`: use the unconfigured/accountless app, explicitly confirm one cycle, terminate/relaunch with the same test profile, and assert the confirmed cycle/XP persists exactly once while playback stays paused. This proves independence from configured services, not physical airplane-mode behavior.
- [x] Exercise normal service settings and local/cloud/download confirmations with the largest Dynamic Type size, light/dark appearance, and Reduce Motion. Restore simulator settings afterward; do not use private APIs or alter the user's phone settings.
- [x] Exercise a long localized purchase label using local StoreKit fixture product metadata, without buying. Verify the full price is available to accessibility and purchase/restore controls remain reachable; never inject fabricated ownership to obtain a layout pass. Record the fixture configuration and keep the ordinary StoreKit fixture restored for other tests.
- [x] For any presentation fixture added, confine it to Debug and UUID-scoped test profiles. Include its exclusion in the existing Release product guard. Do not add a general production API solely to mutate a test snapshot.
- [x] Inspect dark/light rendered surfaces and minimum 44-point actions as well as accessibility metadata. Hidden first-word/silent-stage content must remain hidden except in authorized reference views. Record screenshots locally; mark manual visual findings separately from assertions.
- [x] Fix only demonstrated parity/accessibility defects through the agreed UI seam. Rerun the focused test after each change and compile with Swift 6 checks regularly.

## Task 4: Verify the complete candidate and review the patch

**Files:** Update `docs/swift-native/cutover-matrix.md` and `cutover-acceptance.md` with fresh results. Reuse `native-ios/scripts/verify-native-product.sh`, `test-ci-configuration.sh`, and existing native project/CI definitions.

**Consumes:** Candidate source, completed Tasks 1–3, an isolated iOS 27 simulator, fictional CI service identity, and pinned review base `1096342`.
**Produces:** A reproducible local acceptance report with exact revision, commands, results and unresolved gates.

- [x] Run `swift test --package-path native-ios/Packages/<package>` for all six packages: LearningDomain, LearningPersistence, LearningReference, LearningMedia, AppleServices, AppFoundation. Require no failing tests.
- [x] Generate `native-ios/project-ci.yml`. On a newly created dedicated iOS 27 simulator, run `StoreKitFixtureSetup` before the complete `MetaShadowingNative` test scheme. Use ad-hoc signing, serial target execution, and finalized result bundles. Require a nonempty suite with zero failed/skipped tests; do not retry failures into a green result without diagnosis.
- [x] Build Debug and Release and run `bash native-ios/scripts/verify-native-product.sh <app> <configuration>` for each. Require the iOS 26.0 minimum, original sample/launch assets, correct entitlements, and no shipped Expo/React Native/JavaScript runtime or Release test bypasses.
- [x] Run the clean-checkout configuration test, service mapper self-test, fictional downloader build, actionlint, and diff checks if their boundary changed. Do not restore Expo hosted CI or change remote protection rules.
- [x] Use `code-review` against the pinned base, with independent Standards and Spec reviewers. Include the approved design, #99, this plan, and the evidence matrix. Resolve actionable findings and rerun affected tests; run the final complete suite after the last behavioral change.
- [x] Commit only reviewed #99 files on the current branch. Do not commit pre-existing dirty documents/tests or private artifacts. PR creation/push and issue closure remain separate user actions.

Execution evidence: final local packages passed 341 tests. Complete native coverage
used the two complementary selections documented by native CI: 19 player cases and
85 remaining cases, both with zero failures/skips. The initial full-run fixture
failure, its test-precondition correction, and an interrupted concurrent UI attempt
remain documented in the acceptance report. No test assertion or timeout was weakened.

## Task 5: Authorized device/live-service acceptance and controlled replacement

**Files:** Record sanitized evidence in `docs/swift-native/cutover-acceptance.md`; retain private recovery artifacts outside tracked files. Link #103 and #99 evidence without marking unperformed checks passed.

**Consumes:** Verified candidate, available reference source/binary, designated device/build identity, and narrowly scoped owner approval.
**Produces:** Either verified controlled replacement or a precise blocked report. Automated success alone cannot complete this task.

- [ ] Identify the current installation, candidate identity, storage namespace, reference commit and recoverable reference binary locally. If the binary is unavailable, report that blocker before replacement. Record a private checksum/path; publish neither identifiers nor local paths.
- [ ] Immediately before replacement, show the exact affected installation and reset scope to the owner. Default to no uninstall and no data deletion. Existing permission that data is disposable is not authorization to erase it. Obtain the final approval required by #99.
- [ ] Install only the approved signed candidate. Verify the normal bundled lesson, offline use, all stage families, saved preferences, interrupted/reopened progress, references, and distinct removal/reset controls. No automatic cloud restore, sync enablement, or history reset.
- [ ] Run #103's remaining hardware checks through the finished player: cycle/Repeat haptics, wired route and monitoring permission, headset actions, unplugging, real interruptions, lock/background, and exit/completion cleanup. Ask for owner observation where hardware or tactile feedback cannot be verified remotely.
- [ ] Separately obtain the designated sandbox purchase account and CloudKit Development/disposable-data scope before live-service operations. Verify StoreKit purchase/restore/pending/cancel/decline, real hosted delivery/cancellation, account switching, quota/permission recovery, multi-device reconciliation, and scoped resets. Missing credentials, second device, entitlement, or service configuration is `blocked`, not a fixture pass. Do not request passwords in chat or accept agreements.
- [ ] Keep reference source/binary recoverable after replacement. State explicitly that reinstalling the old binary does not restore new Swift progress or provide downgrade compatibility.
- [ ] Declare #99 complete only after required matrix rows and the designated installation gate are verified, or after a separate explicit owner scope amendment. No TestFlight, App Store release, production schema change, or reference-source removal follows automatically.

## Approval handoff

Review this plan and confirm the five test seams. Preserve the already-selected sequential/main-agent execution method. Approval starts local Tasks 1–4; Task 5 still requires its exact installation, account, and reset approvals at the point of action. If device/service gates remain unavailable, deliver the verified local work and explicit blockers without claiming completed cutover.
