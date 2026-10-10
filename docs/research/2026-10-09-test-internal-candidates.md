# Test-internal performance candidates

Date: 2026-10-09. This is a read-only source audit, not a measured optimization result. It proposes test changes only. The existing two-device execution, complete inventory checks, assertion ownership, timeouts, real media, and production behavior remain the constraints.

The [current measured run](2026-10-09-local-native-parallel-results.md) passed all 180 identifiers in 1,745.104 seconds (29m 05s). Its overlapping UI phase took 1,263.675 seconds (21m 04s). Those historical timings identify the expensive phase; they do not measure the candidates below. The previous [existence-wait work](2026-10-09-ui-wait-expansion.md) already retained the original assertions while reducing positive-presence polling and consolidating three launches.

## Source inventory

The audit counted these source call sites in `native-ios/Tests/AppUITests`; loops and shared helpers can execute them multiple times:

| Operation | Source count |
| --- | ---: |
| `existsOrWait(timeout:)` calls, excluding its declaration | 171 |
| `wait(for:toEqual:timeout:)` | 255 |
| `isHittable == true` property waits | 88 |
| `isEnabled == true` property waits | 49 |
| `isSelected` property waits | 11 |
| `label` property waits | 106 |
| `exists == false` property waits | 1 |
| `descendants(matching: .any)` queries | 32 |
| `.frame` property reads | 96 |
| Explicit `launch()` / `terminate()` calls | 55 / 25 |
| `waitForNonExistence(timeout:)` calls | 15 |
| Bounded `for ... where !element.isHittable` scroll loops | 28 |

These are not runtime snapshot counts, launch counts, or seconds saved. No additional tests, builds, simulator operations, or Git mutations were performed for this audit.

The property count includes the unqualified `wait(for:)` inside `NumericTextFieldActions.replaceNumericText`. A regex that requires a leading dot misses it. The label count includes the expected string `학습 언어, 일본어`; splitting arguments on a comma inside a string undercounts that call.

## Recommended first patch: immutable values within one observation phase

Cache a value returned by `.frame` or `.label` when several assertions inspect the same element without an intervening action, wait, lifecycle event, or intended temporal observation. Preserve every assertion and tolerance. Capture fresh values after each interaction. This is a small test-only change with a clear assertion-preservation argument.

Concrete owners:

- `ProductUITests.testExperiencePopoverShowsCurrentLevelWithoutChangingProgress`: the initial XP/streak geometry uses five `experience.frame` reads, including the later popover anchor, and four `streak.frame` reads. Two local `CGRect` values preserve all alignment/bounds assertions and the anchor, removing seven explicit frame reads before the tap. Read the post-popover geometry separately.
- `BookshelfUITests.testInstalledCardOpensStagesAndBundledMenuCannotDelete`: before the second card-hittability wait, the card's height/top/right and menu's width/height/bottom/right are read separately. One frame for each preserves those seven accesses with two reads. Keep the second wait and take fresh geometry for the screenshot crop after it; do not reuse pre-wait geometry across that boundary.
- `PlayerUITests.testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages`: each of six rows reads `frame.minY` and `frame.maxY` consecutively. Capture `row.frame` once per row after its existence gate. All twelve order assertions across the two stage variants remain.
- `PlayerUITests.testProgressTrackWidthSurvivesCounterDigitBoundary`: keep separate before/after frames around the actual source selection. Within the after block, one frame supplies both width and leading-edge assertions.
- `PlayerUITests.testVideoStaysFixedWhileLargeLessonTextScrolls`: retain the drag and both pre/post phases. Read the post-drag video frame once for its position and height assertions.
- `PlayerUITests.testAudioLayoutChangesBetweenConversationAndReadingWithoutCredit`: take fresh first-line, second-line, and list-card frames after the existing display-save readiness gate. Reuse them only for that phase's alignment and containment assertions.
- `ProductUITests.testLearningSettingsSummariesWrapAtLargestTextSize`: after each required scroll and reachability check, capture the row frame once for horizontal containment and the optional font-row height assertion.
- `ProductUITests.testSettingsPreviewsShowTwoSeparateLongQuotedSentences`: cache each original and translation label within its existing assertion block. Preserve quote prefix/suffix checks and the original label's minimum length. Capture fresh geometry after changing display mode.
- `AppleServicesUITests.testServiceConfirmationsInLightAndDarkAtLargestText`: after the cloud-action scrolling loop finishes, cache its final frame for the two viewport-bound assertions. Re-read within every scrolling iteration; never reuse the first frame after a drag.

Counterargument: repeated reads might accidentally observe a later layout. These tests express simultaneous geometry constraints, not stability over an interval. Reusing an immutable value within one phase makes that meaning clearer. Any explicit before/after comparison, timeout, screenshot boundary, or media transition must retain separate observations. Do not add `snapshot()` everywhere: for a frame-only block, a local `CGRect` is simpler and avoids requesting an entire subtree.

## Candidate second patch: narrowly applied property fast paths

`UIElementWaits.swift` can add an immediate check with the original XCTest wait as fallback. An illustrative predicate is `exists && self[keyPath: keyPath] == expected`; if it does not match, call the unchanged `wait(for:toEqual:timeout:)`. This retains the expected value and full fallback timeout. The existing `existsOrWait` implementation establishes this pattern for presence only; it does not validate property behavior.

The source has 88 positive hittability gates. After inspecting every call, the conservative first subset contains 84 navigation/visibility/editing gates and excludes four diagnostic startup gates. A specialized `hittableOrWait(timeout:)` helper makes this scope explicit. Representative owners are the `PlayerUITests.fixture` and `ReferenceToolsUITests.openFixture` book gates, `LearningPlayerActions.exitLearningThroughOptions`, and the unqualified wait in `NumericTextFieldActions.replaceNumericText`. Preserve the original property, timeout, failure message, and all subsequent assertions. Existence alone must never substitute for hittability.

The exact exclusions are `DownloadLabUITests.swift` lines 15, 30, 47, and 62 at the audit revision: initial `lab-seed` and `lab-download` gates. `DeveloperDownloadLabView` renders these controls while `DeveloperDownloadLabModel.open()` awaits real delivery preparation and stored facts. The controls are disabled until `ready` becomes true. Hittability does not itself prove enabled state; the old polling delay could mask startup readiness. Keep these four waits unchanged initially. A later change can explicitly prove enabled readiness and characterize that path before adding the fast check.

The other potentially ambiguous cases retain independent evidence: `NativeFoundationUITests` checks confirmation enabled before hittability; the sync-consent journey retains its explicit enabled assertion; hosted download/removal switches between distinct book/download identifiers; the presentation-only download preview conditionally removes and recreates its download button; and download-lab cancellation follows `startDownload()` setting `downloading` synchronously. None of the retained 84 hittability predicates is the sole explicit durable-save completion barrier.

Before broadening, characterize already-matching, delayed-matching, never-matching, and missing-element behavior with real UI. A missing element must not satisfy a false-valued property because of a default accessibility value. Validate both the immediate path and original timeout fallback. Measure the actual helper and representative journeys; the source count is not a savings estimate.

Do not replace every property wait mechanically. Two different meanings currently share the API:

1. A momentary state predicate, such as a hittable destination, a newly selected tab, or a changed cycle label.
2. An attempted operation-settled barrier whose expected value can already match before the operation finishes.

The second category needs individual analysis. Retain these waits in the first patch:

- Preference-save `isEnabled == true` waits in `ProductUITests`, including layout, rate, group size, typography, preset/reset, and the waits immediately before relaunch. `PreferenceEditorView.commit` assigns the draft before awaiting the save, so a draft value or selection alone is not proof of durable completion. The editor disables while saving, but a test that has not observed that transition must not depend on an undocumented initial polling delay as its only settling barrier.
- Equivalent option-save waits in `PlayerUITests`, including `testPlayerOptionsSummariesReflectActiveRunAndVideoLayout`, `testSilentSpeedPresetsRequireExplicitRunSelection`, `testPausedRateEditorKeepsGlobalPreferenceSeparate`, and layout changes. Keep save-failure and retry assertions intact.
- `OfflineAcceptanceUITests.testDownloadedLessonSurvivesOfflineRelaunchWithoutNewCredit` explicitly waits for the grouping editor to become enabled before terminating. Its changed selection is a draft signal; do not remove the settled-save gate.
- `DownloadLabUITests.testLocalResetAndRecoverySurviveProcessRelaunchWithoutDuplicateXP` taps Restore a second time, then waits for `합성 테스트 XP: 3` before termination. That XP value already exists before the second restore. A fast path could return before the second restore finishes. Keep this wait or separately establish completion of that exact second operation before optimizing it.
- Player `.isEnabled` waits driven by real media/reveal completion and no-credit label waits should remain unchanged initially. They may support a fast predicate later, but their responsibility extends beyond locating controls.

The delayed-preset-save test is a useful exception to review explicitly: `testRevealLevelWaitsForPendingPresetSave` first asserts all four level buttons are disabled, then waits for the first level to become enabled. The transition is witnessed. An immediate matching predicate does not remove the pending-save check, provided the four disabled assertions, eight-second injected save, unchanged active-WPM assertions, and explicit selection remain. This should not justify weakening the other save gates.

Counterargument: XCTest property waits already define success as a matching value, so the fast path preserves their logical predicate. That is true, but removing an incidental polling delay can expose a test that previously advanced before proving an asynchronous operation finished. Such a failure requires correcting the operation-specific readiness evidence; it is not a reason to add sleeps, retries, shorter media, or production idling bypasses.

## Bounded scrolling: stop querying after reaching the target

All 28 loops of the form `for _ in 0..<N where !element.isHittable { swipe() }` intend to reach a target with at most N scroll actions. Swift still evaluates the `where` condition on every remaining iteration after the target is hittable. Replace the condition with an early break inside the same bounded loop. Retain the same query, scroll action, direction, coordinate, maximum count, and post-loop assertions/actions. Query again on every iteration that can actually scroll; never cache hittability across a scroll.

The 28 owners are distributed as follows: `PlayerUITests` 11, `ReferenceToolsUITests` 7, `AppleServicesUITests` 2, `NativeFoundationUITests` 2, `ProductAccessibilityUITests` 2, `ProductUITests` 2, `LearningPlayerActions` 1, and `VoiceOverSemanticsUITests` 1. Every body contains scrolling or dragging rather than deliberate idle polling. Their contracts are reachability, not repeated observation for a duration. The explicit two-second reference predicates are unrelated and stay unchanged.

The existing custom viewport loop in `AppleServicesUITests.testServiceConfirmationsInLightAndDarkAtLargestText` already breaks when the control is hittable and inside the content viewport. Keep its extra geometry conditions; it is not one of these 28 `where` loops.

Counterargument: a target could be hittable transiently before the native scroll settles. Both forms depend on XCTest's ordinary interaction synchronization, and the remaining checks/actions still require the real target. Do not remove final reachability checks or replace scrolling with coordinate taps. Any timing regression requires inspecting the specific transition, not adding an arbitrary delay.

## Lower-priority query changes

The 32 app-wide `descendants(matching: .any)` calls mostly target cycle timelines, player progress, reward receipts, learning lines, or launch artwork. Prefer an existing typed query only after confirming the actual iOS 27 accessibility element type and uniqueness in the affected configuration.

Source gives useful candidates: `player-progress` comes from a SwiftUI `ProgressView`; `player-xp-receipt` and `player-completion-receipt` come from `Text`; learning lines already use `app.staticTexts` in other tests. The cycle timeline explicitly combines/ignores children and may surface differently. Source view type alone is not runtime element-type proof. Preserve identifiers and uniqueness checks. Do not replace unique subscripts or count assertions with `firstMatch` to hide duplicate matches.

`VoiceOverSemanticsUITests.testVoiceOverLabelsValuesAndOrder` reads a stage query count and then sixteen separate identifiers. A single hierarchy snapshot could derive the same ordered identifier array, but only after confirming traversal order and the exact included button set. `allElementsBoundByIndex` alone does not establish that subsequent property reads use one snapshot. This is more complex than caching local frames, so defer it until measured evidence warrants the change.

## Work that must remain

- Keep all 75 UI methods and all 180 native identifiers. No additional method consolidation has a demonstrated identical-context owner in this audit.
- Keep process relaunch in storage/media durability, completed-run credit, preferences, offline acquisition, reset/recovery, and save-retry journeys. Home/activate is not a replacement for process termination and reconstruction.
- Keep the two-second deadlines in `ReferenceToolsUITests.testOverflowIndicatorPersistsAfterScrolling` and `assertPausedWithoutCredit`. They verify behavior after native indicator fade or delayed autoplay opportunity, not generic wait overhead.
- Keep all 15 disappearance waits and the remaining `exists == false` alert-dismissal gate initially. Disappearance must not become an immediate negative assertion after a tap.
- Keep all eight principal-screen audit points for light, dark, and largest text: 24 combined audit invocations. Each includes VoiceOver-related gate categories and retained visual findings. Removing non-gating categories would still lose collected evidence. Keep the additional player accessibility audit and screenshot-based color/layout evidence.
- Keep real native media completion, three/five-cycle confirmation, slow-rate disabled-state observation, native scrolling, Back versus Close, copy feedback, and dictionary dismissal paths.
- Keep the ten-second slow download fixture, diagnostic transport timing, and eight-second delayed save. They create observable cancellation/pending states.

## Fixture and AppFoundation assessment

`ProductTestCatalog` already caches its materials task per catalog. `SyntheticMediaFixtures` reuses an existing tone/video file within the same profile; a fresh profile generates two two-second WAV files or a 90-frame video with audio. Relaunch with the same UUID reuses the files. Fresh UUIDs isolate SQLite state and service configuration. Cross-test profile reuse would compromise this isolation.

`ProductWorkspace.load` reads saved progress and stage checkpoints, and `ProductModel` publishes a committed snapshot after the asynchronous operation succeeds. Those are production responsibilities exercised by the tests. Bypassing them, seeding completion instead of tapping confirmation, or changing the production launch gate is outside this test-internal patch.

Pre-generated immutable media or a carefully scoped syntax-file cache could reduce fixture construction, but there is no measured fixture contribution in this audit. Such work affects Debug application code and needs its own corruption, identity, concurrency, and Release-exclusion checks. Defer it behind test-only query changes.

## Verification plan and limits

Implement frame/label reuse first and inspect the diff for one-to-one assertion preservation. If the property helper is selected, characterize it separately, then run the affected UI journeys with real iOS 27 UI. Retain all original timeouts, screenshots, negative checks, media actions, failure injections, and relaunches. Compare a focused before/after pair on the same dedicated device, then run the unchanged two-device complete gate and exact identifier-union validation.

Report compilation, actual executed identifiers, failures/skips, focused timing, and complete wall time separately. A full pass proves the retained checks passed; it does not prove human VoiceOver behavior, physical-device behavior, live Apple services, or a repeatable timing improvement. No numeric speedup estimate is supported yet.
