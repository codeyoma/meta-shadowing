# Swift-native product UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan sequentially, as previously selected by the owner. Use the implement, tdd and code-review skills at the gates described below. Steps use checkbox syntax for tracking.

**Goal:** Complete #96 by replacing the preview shell with native browsing, settings and a usable sixteen-stage learning flow over the reviewed Swift domain, SQLite and media services.

**Architecture:** AppFoundation owns catalog/workspace coordination and committed browsing preferences. LearningDomain remains the authority for practice, progress and text visibility; LearningMedia owns playback, lifecycle and feedback. SwiftUI views render narrow presentation values, with UIKit bridges only for native video surfaces or interactions SwiftUI cannot provide.

**Tech Stack:** Swift 6, SwiftUI, Observation, system SQLite, AVFoundation, existing Core Haptics services, Swift Testing and XCUITest. iOS 26.0 minimum; verify on iOS 27.

**Spec:** [#96](https://github.com/codeyoma/meta-shadowing/issues/96), [approved migration roadmap #91](https://github.com/codeyoma/meta-shadowing/issues/91), [PRODUCT.md](../../../PRODUCT.md), [learning contract](../../learning-contract.md), [storage contract](../../swift-native/learning-storage-contract.md), and [media contract](../../swift-native/media-feedback-contract.md). The locally approved umbrella specification is identified as `docs/superpowers/specs/2026-09-27-swift-native-migration-design.md`; it is not newly published by this ticket.

Status: Owner requested execution again after the plan/seam/baseline handoff on 2026-09-28. Implementation proceeds sequentially. Actual verification is recorded separately in the product UI contract.

Execution record, 2026-09-28: the product implementation and two-axis review are
complete. All 166 package tests and 39 iOS 27 tests pass, as do Debug/Release
product and CI configuration checks. Some planned test names were consolidated
into public-boundary and end-to-end journeys; the original step inventory below
is retained rather than retroactively claiming every proposed test was written.
Manual VoiceOver focus/spoken-output and system Reduce Motion observations remain
unverified. See [the verification record](../../swift-native/product-ui-contract.md).

## Global constraints

- Preserve current capabilities through the migration, using native iOS conventions rather than pixel-identical React Native controls.
- No performance metrics, benchmarks or numerical improvement targets. Correct ownership and observation boundaries remain requirements.
- Keep the shipped application free of Expo, React Native and JavaScript runtimes. Retain reference source and independent authoring tools.
- Playback end, navigation, restoring, editing and backgrounding never confirm practice or earn XP. Only durable domain commands do so.
- Keep existing launch artwork, one-shot animation, doubled launch haptics and Reduce Motion behavior. Do not add a launch haptics menu.
- Preserve six language choices, separate language progress, three actual tabs, light/dark appearance and the supplied brand assets.
- All tappable controls have at least 44-point targets, including visually compact icon buttons. Scale learning fonts once; wrap and scroll content.
- No live account/cloud calls, real purchases, device replacement, data reset, release, Supabase or Android work. Use isolated simulator profiles and public-safe fixtures.
- Do not stage unrelated existing modifications or untracked migration evidence. Do not inspect or alter the unrelated file named `-`.
- Implement and commit on the current branch, `codex/swift-learning-storage`, as requested by implement. Do not push, open a PR, merge or close issues without the corresponding request.
- Proposed review fixed point: `2b97e6755c86defc3656c4894abbe0dff65ed634`. Fetched `origin/dev` contains this commit plus the PR #102 merge, with an identical tracked tree. No merge is necessary for this plan.

## Ticket boundaries

#94 and #95 provide implemented storage/media interfaces. The remaining physical acceptance is tracked in [#103](https://github.com/codeyoma/meta-shadowing/issues/103); only launch haptics have owner-confirmed physical evidence.

#96 must make normal learning reachable without Debug probe buttons. Bundle the existing public `assets/sample/manifest.json` and its twelve original audio files. Validate source identity, relative paths, byte counts and hashes before treating the bundled lesson as usable. Do not substitute generated tones for the normal lesson. Existing generated audio/video fixtures remain useful for isolated automated UI tests.

The current roadmap places installed syntax, relation graphs and Apple dictionary behavior in #97, and StoreKit/hosted delivery/private CloudKit/reset operations in #98. In #96, retain their navigation destinations and honest unavailable states. Exercise loading, disabled, cancel and failure presentation with injected fixtures, not fake live success. Bundled sample content is read-only; removing downloads is not equivalent to deleting bundled resources or learning history. Do not present an unavailable service as completed migration functionality.

## Proposed test seams — confirmation required before writing tests

1. **Public workspace/store boundary:** catalog validation, language/book selection, read-only progress/resume summaries, preferences, authorized lesson opening, cancellation and stale results. Use real SQLite in temporary roots; inject only catalog/access/failure boundaries.
2. **Public player/presentation boundary:** normal actions and paused edits through the coordinator, visibility through domain-backed presentation, runtime lifetime and narrow Observation properties. Use real domain/controller logic and controlled media inputs; do not inspect private SQL or award counters.
3. **User-visible iOS boundary:** XCUITest of Books, Stages, Settings, native sheets and the actual audio/video/silent player on iOS 27. Include accessibility labels, disabled actions, recovery, reentry and large text. Manual VoiceOver/Reduce Motion observations are reported separately from accessibility-tree assertions.

Run one failing behavior test, its minimal implementation and its passing check before taking the next slice. A list of tests below is a sequence, not permission to write all tests first. Confirm the fixed review point above together with these seams.

## Review focus

1. A slow catalog/lesson open finishes after navigation, language/profile change or cancellation: discard its result and close any allocated writer/runtime. Task 2 and Task 4 tests cover this.
2. A menu pauses while a save or media preparation is in flight: settle the checkpoint before editing; keep headset actions blocked and never resume on dismissal. Task 4 tests cover this.
3. Hint-only or incomplete silent text appears in accessibility labels, selection or an off-screen subtree: expose only permitted visible text, including translation-only stages. Task 5 and Task 8 tests cover this.
4. A saved selection or resume points at missing, mismatched or unauthorized content: show recovery without borrowing another book/language or resetting records. Task 1–3 tests cover this.
5. Very long bilingual/grouped content and the largest accessibility text size push actions off-screen: keep content scrollable and navigation/actions reachable without shrinking fonts. Task 5, Task 6 and Task 8 tests cover this.

## File and responsibility map

All paths below are repository-relative. Existing files are modified only for the listed responsibilities.

| Files | Responsibility |
| --- | --- |
| `native-ios/Packages/LearningDomain/Sources/LearningDomain/LearningBrowsing.swift` | Read-only language and stage checkpoint summary values; no timers or UI frameworks |
| `native-ios/Packages/LearningDomain/Sources/LearningDomain/LearningStore.swift` | Narrow public browsing queries alongside the existing command interface |
| `native-ios/Packages/LearningPersistence/Sources/LearningPersistence/LearningBrowsingStorage.swift` | Read-only, profile-isolated SQLite projections using existing ledger/checkpoint validation |
| `native-ios/Packages/AppFoundation/Sources/AppFoundation/ProductCatalog.swift`, `BundledProductCatalog.swift` | Catalog/material values and validated bundled sample loading |
| `native-ios/Packages/AppFoundation/Sources/AppFoundation/ProductWorkspace.swift`, `ProductModel.swift` | Actor-owned storage operations and main-actor observable browsing/load state |
| `native-ios/Packages/AppFoundation/Sources/AppFoundation/LearningUnitPresentation.swift`, `LearningTypographyDraft.swift` | Paired visible text presentation and validated editor drafts; consume domain rules |
| `native-ios/Packages/LearningMedia/Sources/LearningMedia/LearningMediaCoordinator.swift`, `LearningPresentationState.swift`, `NativeLearningRuntime.swift` | Safe paused edits and separate control/motion observation |
| `native-ios/App/MetaShadowingApp.swift`, `RootView.swift`, `LaunchGateView.swift` | Compose the product workspace and retain one-shot launch behavior |
| `native-ios/App/Browsing/ProductTabsView.swift`, `StudyHeaderView.swift`, `LibraryView.swift`, `BookCardView.swift`, `StagePathView.swift` | Native browsing destinations, language header, cards and stage access presentation |
| `native-ios/App/Player/LearningFlow.swift`, `LearningPlayerView.swift`, `LearningContentView.swift`, `LearningControlsView.swift`, `LessonVideoSurface.swift` | One mounted runtime, dedicated player and focused text/video/timeline subviews |
| `native-ios/App/Player/LearningOptionsView.swift`, `AllSentencesView.swift`, `LearningGuideView.swift` | Paused native sheet navigation, explicit reference navigation and guide |
| `native-ios/App/Settings/SettingsView.swift`, `LearningPreferencesView.swift`, `TypographyEditorView.swift`, `RateEditorView.swift`, `RevealSpeedEditorView.swift`, `ServiceUnavailableView.swift` | Shared editors, settings destinations and truthful deferred-service states |
| `native-ios/App/Shared/BrandStyle.swift`, `LearningFont.swift` | Adaptive brand colors and built-in font resolution without downloads |
| `native-ios/Tests/AppUITests/ProductUITests.swift`, `PlayerUITests.swift`, `ProductAccessibilityUITests.swift` | User-visible product journeys replacing only obsolete preview-shell expectations |
| `native-ios/Tests/MediaIntegrationTests/LearningFlowTests.swift`, `RuntimeObservationTests.swift` | Real iOS lifetime, paused editing and observation tests |
| `native-ios/project.yml`, `native-ios/README.md`, `docs/swift-native/product-ui-contract.md` | Bundle resources, test source inclusion, usage and sanitized evidence |

Keep existing W3/W4 probes and regression tests. New package tests sit beside the public interface they exercise; exact paths appear in the tasks below. Do not introduce a new dependency from AppFoundation to LearningMedia, which already depends on AppFoundation.

## Task 1: Validated content and read-only browsing data

**Files:** Create `LearningBrowsing.swift`, `LearningBrowsingStorage.swift`, `ProductCatalog.swift`, `BundledProductCatalog.swift` from the map. Modify `LearningStore.swift` and its existing test doubles in `AppFoundationTests/LearningControllerTests.swift` and `LearningMediaTests/GatedLearningStore.swift`. Add `LearningPersistence/Tests/LearningPersistenceTests/LearningBrowsingTests.swift` and `AppFoundation/Tests/AppFoundationTests/ProductCatalogTests.swift`.

**Interfaces:**
- `LanguageStudyProgress` contains `xp: Int64`, `level: LevelProgress`, `streak: Int`; construct through the existing reward ledger/level implementation.
- Add `LearningStore.readLanguageProgress(profileID: String, language: String, today: StudyDay) async throws -> LanguageStudyProgress` for headers, including languages without a book.
- Add `LearningStore.readCheckpoint(plan: LearningPlan) async throws -> LearningSession?`. Return a validated paused checkpoint without opening a writer, incrementing a revision or changing latest-learning selection. A completed checkpoint remains readable history, not an unfinished resume.
- `CatalogBook: Identifiable, Equatable, Sendable` uses the versioned package key as `id` and carries book ID, language ID, title and sentence count.
- `BookMaterials: Sendable` carries a `CatalogBook`, authorized local root, `[LearningSource]` and media descriptors. `BookMediaAsset` has `.audio(file: URL)` and `.video(file: URL, start: Double, end: Double)`; these are metadata, not transport objects.
- `ProductCatalog: Sendable` exposes `books() async throws -> [CatalogBook]`, `materials(packageKey: String) async throws -> BookMaterials`, and `permitsPractice(packageKey: String) async -> Bool`.
- `BundledProductCatalog.init(root: URL)` implements those operations for the supplied sample. The composition root resolves the resource URL; the package does not consult `Bundle.main`.

- [ ] Write `catalogRejectsEscapedOrCorruptAudio` using copied public fixtures: expected sample count `12`, key `morning-notes-v1`; changed bytes, traversal or symlink escape throws before returning materials.
- [ ] Run `swift test --package-path native-ios/Packages/AppFoundation --filter ProductCatalogTests`; observe failure, then implement bounded manifest decoding and SHA-256/byte validation off the main actor. Re-run to pass.
- [ ] Write and run `browsingDoesNotMutatePractice` at the store interface. After one explicit confirmation, checkpoint reads preserve the backup revision and XP; reopening the store returns the same paused unit/cycle.
- [ ] Implement read queries using existing native/imported checkpoint and reward logic. Do not export/decode a full backup on every UI refresh or create a synthetic book to query language XP.
- [ ] Add separate red/green cases for empty-language zero progress, different-profile isolation, completed checkpoints, incompatible sources and imported checkpoints. Run `swift test --package-path native-ios/Packages/LearningPersistence --filter LearningBrowsingTests`.
- [ ] Typecheck affected packages with `swift build --package-path native-ios/Packages/AppFoundation` and `swift build --package-path native-ios/Packages/LearningMedia`; commit only this task's explicit paths with `feat(ios): expose validated product browsing data`.

## Task 2: Product workspace and committed selection/preferences

**Files:** Create `ProductWorkspace.swift` and `ProductModel.swift`; add `AppFoundation/Tests/AppFoundationTests/ProductWorkspaceTests.swift` and `ProductModelTests.swift`.

**Interfaces:**
- `ProductWorkspace` is an actor initialized with `store: any LearningStore`, `catalog: any ProductCatalog`, `profileID: String` and an injected clock/calendar.
- `load() async throws -> ProductSnapshot`, `select(language: String, packageKey: String?) async throws -> ProductSnapshot`, and `saveLearningPreferences(_ value: LearningPreferences) async throws -> ProductSnapshot` publish durable results only.
- `ProductSnapshot: Equatable, Sendable` holds preferences, language progress and `[BookStudySummary]`. Each summary pairs a catalog book with persisted completion counts and stage checkpoint summaries, not live media state.
- `openLesson(packageKey: String, stage: Int, verifiedTestAccess: Bool) async throws -> OpenedLesson` rechecks content and `StageProgress.canOpen`, then constructs the existing `LearningController`. `OpenedLesson` contains controller, initial state and materials.
- `ProductModel` is `@MainActor @Observable` with `state: ProductLoadState` (`idle`, `loading`, `ready(ProductSnapshot)`, `failed(lastCommitted: ProductSnapshot?)`). It exposes `activate() async`, `deactivate()`, `select(language:packageKey:) async` and `saveLearningPreferences(_:) async`. Generation tokens discard stale loads/selections; failed saves retain the last committed visible selection/preferences and show recovery.

- [ ] Write `languageSelectionSurvivesRelaunchWithoutLearningCredit`: choose Japanese with no book; reload expects Japanese, zero Japanese XP and no English selection. Run `swift test --package-path native-ios/Packages/AppFoundation --filter ProductWorkspaceTests` red, implement, then green.
- [ ] Add `browsingDoesNotReplaceLatestLearning` and preference-save failure/retry cases through the workspace. Preserve per-run rate/group/reveal values when global defaults change.
- [ ] Add `lateLoadCannotReplaceNewSelection`, `deactivationRejectsLateOpen` and `lockedOrMissingLessonCannotOpen` through public operations. A retired open must revoke its newly created writer before returning.
- [ ] Run `swift test --package-path native-ios/Packages/AppFoundation --filter ProductModelTests` and `swift build --package-path native-ios/Packages/AppFoundation`; commit explicit paths with `feat(ios): coordinate native product workspace`.

## Task 3: Native shell, library and stage path

**Files:** Create the Browsing files and `BrandStyle.swift`; modify the three app composition files and `native-ios/project.yml`; add `ProductUITests.swift`. Update only the preview-specific cases in `NativeFoundationUITests.swift` to product expectations.

**Interfaces:** `ProductTabsView(model: ProductModel)` contains Books, Stages and Settings. `LibraryView(snapshot: ProductSnapshot)`, `StagePathView(summary: BookStudySummary)` and `StudyHeaderView(language: String, progress: LanguageStudyProgress)` receive no media runtime. Navigation requests identify package key and stage, never an unvalidated arbitrary file URL. The root owns the single selected learning route.

- [ ] Add `testBooksStagesSettingsAndEmptyLanguage` using an isolated Debug UI-test profile. Expect three navigable tabs, all six language choices, and empty Books/Stages for a language without books. Run the focused iOS 27 UI test red.
- [ ] Replace the normal preview shell with the product model and native `TabView`/`NavigationStack`. Preserve launch gating by changing its bootstrap input, not its artwork/timing/haptic implementation. Keep stale-load/retry tests at the new root boundary.
- [ ] Bundle `assets/sample` as a directory preserving relative audio paths, plus the existing book cover and mascot. Do not copy private content or mutate supplied images. The mascot is decorative, not a disabled fourth tab.
- [ ] Render truthful book counts, XP and stage completion; equal grid gutters; adaptive title space; sentence-only metadata; centered icon actions with accessible names. Preserve the owner's compact badges and no library banner logo. Use one column at accessibility text sizes rather than truncating titles.
- [ ] Render sixteen stage entries, three-run completion status, paused resume and locked/unavailable states. Both stage selection and direct player entry use the domain access policy. Debug access may bypass predecessor completion without writing stars/XP; Release remains conservative until #98 verifies distribution.
- [ ] Add separate passing journeys for load retry, unavailable content and foreground/day refresh. Native tab/flag haptics remain quiet on disabled controls; settings editors do not add tap feedback.
- [ ] Regenerate with `xcodegen generate --spec native-ios/project-ci.yml`, run focused UI tests and an unsigned Debug build on the dedicated iOS 27 simulator; commit explicit paths with `feat(ios): add native browsing and stage screens`.

## Task 4: Player lifetime, paused editing and observation boundaries

**Files:** Create `LearningFlow.swift`, `LearningPresentationState.swift`, `LearningFlowTests.swift`, `RuntimeObservationTests.swift`. Modify coordinator/runtime and add cases to `LearningMediaTests/LearningMediaCoordinatorTests.swift`.

**Interfaces:**
- `LearningFlow` owns opening/active/failed/closing state and one runtime. `open(packageKey: String, stage: Int) async`, `presentOptions(_ route: LearningOptionRoute) async`, `dismissOptions()` and `close() async` serialize lifetime. Await runtime closure before replacing a writer.
- Add `LearningMediaCoordinator.editWhilePaused(_ event: LearningEvent) async -> LearningMediaState`. Accept only `.changeRate`, `.changeRevealSpeed`, `.regroup` and `.selectSource`; require a settled successful pause, active writer and retained access. Permit these explicit edits while a menu is open without enabling playback or headset actions. Reject confirmation, Repeat, resume and stale-context events at this seam.
- `NativeLearningRuntime.controls: LearningControlPresentation` and `motion: LearningMotionState` expose separately observed semantic controls and seconds/duration/reveal timing. Keep any compatibility `state` reads restricted to existing probes; the new shell/player parent must not subscribe to that aggregate property.
- Control projection excludes position seconds and writer-version churn. Derive main/Repeat eligibility from the coordinator's existing action gate rather than reproducing it in views. The timeline/reveal subtree alone reads motion.

- [ ] Write `menuEditsRemainPausedAndRemoteBlocked`: after menu entry, change rate to `1.25`, group size to `3`, or select a source; verify saved result, unchanged XP, stopped output and rejected remote presses. Each command is a separate red/green case. Add invalid resume/confirm attempts and save-failure recovery.
- [ ] Implement settled pause/edit support without temporarily setting menu-open to false. Run `swift test --package-path native-ios/Packages/LearningMedia --filter LearningMediaCoordinatorTests` after each case.
- [ ] Add `testCloseDuringOpenDiscardsRuntime` and `testMenuWaitsForPendingSave`. Exercise a controlled delayed open/save, then navigation/inactivity. Assert no active retired writer/output and no late sheet publication.
- [ ] Add `testPositionDoesNotInvalidateControlOrBrowsingObservers` using `withObservationTracking` against the public narrow properties. Position-only changes invalidate motion; a real action change invalidates controls. This is a correctness assertion, not a frame-rate benchmark.
- [ ] Run focused iOS integration tests plus the affected package tests and Debug typecheck/build; commit explicit paths with `feat(ios): own player lifetime and narrow state updates`.

## Task 5: Audio/video/silent player and safe text rendering

**Files:** Create `LearningPlayerView.swift`, `LearningContentView.swift`, `LearningControlsView.swift`, `LessonVideoSurface.swift`, `LearningUnitPresentation.swift` and `LearningFont.swift`. Add `AppFoundation/Tests/AppFoundationTests/LearningUnitPresentationTests.swift` and `PlayerUITests.swift`.

**Interfaces:** `LearningUnitPresentation.make(session: LearningSession, revealOriginal: Bool, elapsedSeconds: Double) throws -> LearningUnitPresentation` consumes `StagePolicy`, `LearningText.firstWordHint` and `RevealTimeline`; it never calculates rewards or changes sessions. Present stable source/member identities and paired target/translation lines. `LessonVideoSurface(transport: VideoSegmentTransport)` attaches/detaches an `AVPlayerLayer`; it owns no independent player/audio track.

- [ ] Add `hiddenTextHasNoAccessibleFullTarget` for stages 5, 9, 11, 13 and 15, using literal expected hint/visible text. Test partial reveal, complete reveal and reset on unit/reentry. Run `swift test --package-path native-ios/Packages/AppFoundation --filter LearningUnitPresentationTests` red/green one case at a time.
- [ ] Implement bubble/list presentation of only the current saved unit. Pair complete matching quoted utterances; mismatched quotation/pair counts retain intact source/translation blocks. Test repeated words, multiline text, grouped remainders and non-Latin scripts without guessing sentence alignment.
- [ ] Build the fixed header and footer around a single scrolling content region. Show source/unit progress, method guide, speed and analysis entry. In stages 1–10 show domain-backed cycle nodes, gated main action and third-cycle Repeat; in 11–16 show S1–S4 and no cycle/Repeat/video view.
- [ ] Hide unrevealed target glyphs while retaining layout, and explicitly exclude them from accessibility and selection. The subtitle toggle changes presentation only. Do not attach dictionary actions until #97 implements eligibility/presentation.
- [ ] Add `testRealAudioConfirmationRepeatAndResume`: wait for actual AVFoundation end, assert zero XP before a tap, then assert `1` XP for a single-source confirmation. Third-cycle Repeat adds exactly two cycles; menu dismissal/relaunch never credits or autoplays.
- [ ] Add separate generated-fixture journeys for bounded/grouped video and silent stage 11. Silent completion remains at `0` XP until explicit confirmation, then `3` XP; no AV playback driver/video view exists for silent stages. Keep these fixtures Debug-only and isolated.
- [ ] Use minimal Reduce Motion-aware content/check transitions, accessible control names and a completion surface that does not start another stage automatically. Run focused player UI tests and a Debug build; commit explicit paths with `feat(ios): render native sixteen-stage learning player`.

## Task 6: Shared settings editors and paused reference navigation

**Files:** Create the Settings and remaining Player files in the map, `LearningTypographyDraft.swift`, and `AppFoundation/Tests/AppFoundationTests/LearningTypographyDraftTests.swift`; extend `PlayerUITests.swift`/`ProductUITests.swift`.

**Interfaces:** `LearningOptionRoute: Hashable` has menu, rate, group, revealSpeed, display, typography, sentences, guide and analysis cases. Use one item-driven sheet and a nested native navigation stack. Shared editors consume committed `LearningPreferences`; the caller explicitly chooses global preferences versus active-run edits. `LearningTypographyDraft.validSize(_ text: String) -> Int?` accepts only integer `12...48` values when editing ends.

- [ ] Write `invalidTypographyDraftDoesNotReplaceSavedValue`: `""`, `"-"`, `"11"`, `"49"` and `"20.5"` reject; `"12"`, `"20"`, `"48"` accept. Implement the draft boundary red/green without saving keystrokes.
- [ ] Implement System/Rounded/Serif/Avenir Next/Georgia/Apple SD Gothic Neo choices, independent original/translation sizes and fixed bilingual previews. Sizes reset to `20/18`; font reset changes fonts only. Missing saved font fields remain absent until edited; unavailable fonts render System without overwriting storage.
- [ ] Implement global rate `0.25...3` in quarter steps, group `2/3/4`, four WPM presets defaulting `150/200/250/300`, and bubble/list controls. Preserve existing finer saved rates until adjusted. Native controls save through Task 2, showing failure rather than a false successful selection.
- [ ] Wire active rate/group/S-level edits through Task 4. Do not overwrite global defaults when changing a run; changing typography/display does not reopen the runtime or reset reveal/position.
- [ ] Add All Sentences with current-source positioning and manual-scroll cancellation. It is the explicitly permitted full-text reference surface. Selection issues `.selectSource`, retains confirmed/planned work, resets target position and dismisses to a paused player. No list row grants credit.
- [ ] Add `testOptionsDismissPausedAndSeparatePreferenceScopes`, `testRegroupRetainsConfirmedWork`, and `testAllSentencesCannotSkipCompletion`. Include nested back swipe, sheet drag cancellation/dismissal and a failed save preventing further edits until recovery.
- [ ] Preserve Settings destinations for learning, iCloud, data management and purchase restore. #97/#98-dependent actions explain unavailability and stay disabled; never simulate cloud restore or delete records. Test these truthful unavailable states plus fixture-only pending/cancel/error states for library actions.
- [ ] Run draft/package tests, focused settings/player UI tests and Debug build; commit explicit paths with `feat(ios): add native preferences and paused options`.

## Task 7: Recovery, accessibility and end-to-end acceptance

**Files:** Add `ProductAccessibilityUITests.swift`; extend Task 2/4 tests and product/player UI tests. Change production files only to fix behavior these tests expose.

- [ ] Add `testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay`: inject one failure at the public store boundary, assert unchanged visible XP, visible retry, one eventual award and paused output. A stale writer requires reopening the current saved state, not retrying an obsolete command forever.
- [ ] Add missing/corrupt media retry, cancelled opening, failed content validation, access loss and failed preference-save journeys. Keep records unchanged; do not offer destructive reset as generic recovery.
- [ ] Add long bilingual dialogue/group fixtures at the largest accessibility text size. Assert all text and controls are reachable, no hidden words appear in accessibility queries, and header/footer actions remain tappable in both light/dark appearance.
- [ ] Run accessibility audits for reachable product/player/settings screens. Manually check VoiceOver focus order, sheet return focus, disabled controls, visible text reading and Reduce Motion in iOS 27. If the tooling cannot establish an observation, record the exact remaining check rather than calling the audit a VoiceOver pass.
- [ ] Test background/foreground, menu reentry, completion, close/reopen and relaunch. Use real generated media for UI tests; notification injection is not evidence of a real phone call or wired route.
- [ ] Review data dependencies in every new view: library/header/settings must not read live motion or aggregate runtime state; only timeline/reveal content observes ticks. No SQL, reward arithmetic or new AVPlayer belongs in a view.
- [ ] Run all focused regressions and Debug build; commit scoped fixes with `test(ios): verify native product journeys and accessibility`.

## Task 8: Full verification, two-axis review and handoff

**Files:** Update `native-ios/README.md`; create `docs/swift-native/product-ui-contract.md`. Update storage/media contracts only for changed public interfaces. Do not sweep the existing AGENTS.md/PRODUCT.md edits into this work.

- [ ] Run all four package suites: `swift test --package-path native-ios/Packages/LearningDomain`, then LearningPersistence, AppFoundation and LearningMedia. Require zero unexpected failures/skips.
- [ ] Run `bash native-ios/scripts/test-ci-configuration.sh`, regenerate `project-ci.yml`, and run the full `MetaShadowingNative` scheme on the dedicated iOS 27 Simulator with `CODE_SIGNING_ALLOWED=NO` and `-parallel-testing-enabled NO`. Use the simulator identifier privately, never in committed evidence.
- [ ] Build fresh unsigned Debug and Release products. Run `bash native-ios/scripts/verify-native-product.sh <product-path> <configuration>` on both. Verify release includes the bundled lesson and excludes Debug controls, entitlement bypasses and generated UI fixtures.
- [ ] Document public interfaces, sample usage, remaining #97/#98 service boundaries and actual package/simulator/accessibility results. Keep #103 physical checks separate and retain the owner-confirmed launch-haptics result; no physical reinstall is implied.
- [ ] Inspect `git diff --check`, the exact staged diff and public-safe author/committer identity. Commit documentation and any remaining scoped changes on the current branch. Never use `git add .` in this dirty checkout.
- [ ] Invoke code-review against the owner-confirmed fixed point. Resolve the SHA, require a nonempty three-dot diff and list commits before starting its two parallel Standards/Spec reviewers. Give both #96, this plan and current contracts; paste the full required smell baseline into the Standards prompt.
- [ ] Correct valid findings, rerun affected tests, commit corrections, and repeat the full affected suite if behavior changed after final verification. Report Standards and Spec separately.
- [ ] Hand off commit IDs, checks actually run, remaining dependent tickets and any unverified acceptance. Do not claim the complete migration, physical-device behavior, hosted CI or production services passed merely because #96's simulator checks pass.

## Self-review before approval

- Every #96 deliverable maps to Tasks 1–6; verification requirements map to Tasks 4, 5, 7 and 8.
- Existing W3/W4 domain/media rules are consumed, not copied into views. The explicit paused-edit gap is addressed without opening the headset gate.
- Normal sample learning becomes usable; all dependent service/reference capabilities remain tracked explicitly in #97/#98 rather than being silently removed.
- All five review-focus risks have concrete owning tests. Physical tests remain #103, not inferred simulator successes.
- Execution remains sequential. The owner confirmed execution after the child plan, three test seams and proposed review baseline were presented.
