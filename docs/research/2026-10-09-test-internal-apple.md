# Apple guidance for reducing work inside native UI tests

Date: 2026-10-09. Scope: research and current-source inspection. The existing two dedicated iOS 27 simulators, internally serial UI selections, complete identifier validation, application behavior, assertions, and timeout values are constraints. No native build, simulator operation, test execution, Git mutation, or application change was performed for this note.

The selected first tranche reduces repeated geometry reads, ends bounded scroll searches once their target is hittable, and characterizes an immediate hittability check with the original wait as fallback. Public snapshots and selective query changes remain later experiments. None has a measured speedup in this note.

## Evidence categories

- **Apple fact** means documented public API behavior or explicit Apple guidance, linked below.
- **Repository observation** means current source or an existing dated research record, not a new runtime measurement.
- **Hypothesis** means a proposed explanation or optimization that still needs a controlled comparison.

The existing [wait pilot](2026-10-09-native-wait-pilot-results.md) measured a positive-existence fast path. The [expanded wait report](2026-10-09-ui-wait-expansion.md) describes its adoption and three removed redundant launches. The [two-device report](2026-10-09-local-native-parallel-results.md) documents the now-current execution arrangement. Those results do not establish the performance of property waits, explicit snapshots, or `firstMatch` changes proposed here.

## Three concrete candidates

| Priority | Current test evidence | Proposed experiment | Coverage and risk boundary |
| --- | --- | --- | --- |
| 1 | `ProductUITests.testExperiencePopoverShowsCurrentLevelWithoutChangingProgress` repeatedly reads `experience.frame` and `streak.frame` before its first tap. `PlayerUITests.testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages` reads each row's frame separately for `minY` and `maxY`. | Read each `CGRect` once for that observation phase and reuse its scalar values. Measure the original and revised methods, retaining every geometry assertion and tolerance. | Never reuse a pre-action frame after a tap, scroll, reward, layout change, or relaunch. Do not combine the before/after observations in layout-stability tests. |
| 2 | `LearningPlayerActions.exitLearningThroughOptions`, player fixture setup, and reference/accessibility journeys use bounded `for ... where !target.isHittable` scroll loops. | Use the same iteration cap and gesture, but `break` once the target is hittable. Keep the final hittability assertion or original fallback wait. | The original `where` clause still evaluates the target on remaining iterations after a success. Stop only a target-search loop; preserve deliberately repeated gestures, direction changes, and temporal observation loops. |
| 3 | Helpers and methods repeatedly wait for controls such as `player-options`, `options-close`, and fixture book buttons to become hittable. The coordinating trace audit reports many property waits succeeding at the first logged check. | Characterize an immediate existence-and-hittability check followed by the unchanged original wait when needed. Preserve the same assertion or guard around its result. | Never substitute existence alone. Keep enabled, selected, saved-label, real-media, and negative waits unchanged in the first tranche. Pending elements pay for extra queries; early success does not establish settled geometry. |

Sources for these observations: [ProductUITests](../../native-ios/Tests/AppUITests/ProductUITests.swift), [PlayerUITests](../../native-ios/Tests/AppUITests/PlayerUITests.swift), [VoiceOverSemanticsUITests](../../native-ios/Tests/AppUITests/VoiceOverSemanticsUITests.swift), and [LearningPlayerActions](../../native-ios/Tests/AppUITests/LearningPlayerActions.swift). These priorities reflect source-level opportunity, not measured cost rankings.

### 1. Attribute reads and public snapshots

**Apple fact:** `XCUIElementAttributes` properties expose accessibility data and query the current state of a UI element. `snapshot()` captures an element's attributes and descendant hierarchy. `XCUIElementSnapshot` exposes children and inherits attribute access, including identifier, label, value, enabled/selected state, and frame. [Element attributes](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes), [snapshot provider](https://developer.apple.com/documentation/xcuiautomation/xcuielementsnapshotproviding), [snapshot](https://developer.apple.com/documentation/xcuiautomation/xcuielementsnapshot).

**Hypothesis:** local `CGRect` reuse avoids repeated live attribute access, and one snapshot can amortize retrieval across many assertions. Apple does not promise a fixed number of IPC operations per property or a guaranteed snapshot speedup. A large whole-app snapshot may cost more than several targeted queries. Measure both the query activity and the method's complete duration.

An `XCUIElement` local variable is a live element reference; merely assigning `let button = app.buttons[...]` does not freeze its attributes. Conversely, `let frame = button.frame` stores a value for that observation. A test-only snapshot utility should traverse the public `children` tree, retain element types, reject duplicate expected matches, and produce clear missing/duplicate diagnostics. Avoid parsing `debugDescription` or depending on undocumented dictionary keys.

`allElementsBoundByIndex` immediately evaluates a query and returns element references bound by index; it is not documented as returning frozen attribute snapshots. Therefore changing an indexed loop to `allElementsBoundByIndex.map(\.label)` is not evidence that repeated attribute retrieval has disappeared. [Apple: allElementsBoundByIndex](https://developer.apple.com/documentation/xcuiautomation/xcuielementquery/allelementsboundbyindex).

Potential later call sites are `ProductUITests.testStagePathAndGuideUseCanonicalMethodNames`, which reads a label and value for all 16 stage buttons, and the stage-order block in `VoiceOverSemanticsUITests.testVoiceOverLabelsValuesAndOrder`. A hierarchy snapshot rewrite must preserve typed selection, exact cardinality, and every expected value. Snapshot child traversal order must be verified against the original query before changing a reading-order assertion. These are outside the selected first tranche.

Snapshots do not expose `isHittable` through `XCUIElementAttributes`. Keep live hit-point checks and actual gestures. Preserve explicit count assertions such as the one-close-control and one-list-card checks even when their other attributes come from a shared snapshot. Never use a cached snapshot to prove a later save, media completion, disappearance, or paused state.

### 2. Query selection and `firstMatch`

**Apple fact:** `.element` traverses the accessibility hierarchy to check that a query has exactly one match and fails on ambiguity. Apple recommends `.firstMatch` only when a single match is already known; it stops traversal once it finds a match. This is an explicit performance recommendation with a semantic tradeoff. [Apple: element](https://developer.apple.com/documentation/xcuiautomation/xcuielementquery/element).

Apple also recommends accessibility identifiers for localized strings and concise queries for deeply nested views. That guidance primarily improves resilience; it is not a quantified timing result for this application. [WWDC25: Record, replay, and review, 13:52–15:03](https://developer.apple.com/videos/play/wwdc2025/344/?time=832).

For query predicates, Apple prefers expression-based or format-string predicates over block predicates because the framework can optimize them. This applies to **element-query filtering**; it does not establish that arbitrary condition waits can move into a query without changing their meaning. Current UI queries already commonly use `NSPredicate(format:)`. [Apple: element(matching:)](https://developer.apple.com/documentation/xcuiautomation/xcuielementquery/element(matching:)).

**Repository inference:** a global subscript-to-`firstMatch` replacement is unsuitable. Tests with `count == 1`, stage order, localized button labels, or multiple presentation layers need their original selection meaning. `matching(identifier:)` and subscripts also match identifying properties, not solely a strict identifier field; use an explicit identifier predicate if a snapshot utility intends exact identifier semantics. [Apple: subscript](https://developer.apple.com/documentation/xcuiautomation/xcuielementquery/subscript(_:)).

### 3. Predicate and property waits

**Apple fact:** a predicate expectation periodically evaluates its condition and can also reevaluate in response to events. Apple's public UI APIs support existence, nonexistence, and property-equality waits. Existence alone does not imply hittability. [Predicate expectations](https://developer.apple.com/documentation/xctest/xctestcase/expectation(for:evaluatedwith:handler:)), [XCUIElement](https://developer.apple.com/documentation/xcuiautomation/xcuielement), [exists](https://developer.apple.com/documentation/xcuiautomation/xcuielement/exists).

**Repository observation:** [UIElementWaits.swift](../../native-ios/Tests/AppUITests/UIElementWaits.swift) already performs an immediate positive-existence read before the original fallback wait. Enabled, selected, hittable, label, disappearance, persistence, and media waits remain separate. The existing result proves the positive-existence mechanism only.

**Conditional experiment:** if current activity logs show a repeated initial delay for a property that is already correct, characterize `element[keyPath: property] == expected || element.wait(for: property, toEqual: expected, timeout: originalTimeout)` against real UI. Keep the fallback and the exact original property. Include already-satisfied, delayed, never-satisfied, and initially absent-element cases. Property access on an absent element can behave differently from a wait; a generic helper needs to preserve that case explicitly. This is not a recommendation for an unmeasured global rewrite.

An immediate property read also incurs a query, so it can make truly pending conditions slower. Keep existing real-media completion and committed-state waits until their behavior is characterized. Do not substitute `exists` for `isHittable`, `isEnabled`, saved values, or disappearance. Do not lower timeout limits to claim faster passing tests. Apple's public contract does not specify a fixed polling interval to optimize around.

### Cross-review of the selected first tranche

The coordinating investigator reports 395 inferred property-wait invocations in retained logs; 331, or 83.8%, succeeded at the first logged check. This note's author did not independently parse those logs. These observations support a pilot, but neither prove the property was correct when the wait began nor assign its initial gap entirely to a polling delay. They do not establish 331 seconds of removable work.

The proposed `exists && isHittable` fast path addresses the absent-element property-read risk while retaining the original hittability fallback. Apple's definition of `exists` explicitly requires the separate hittability check. The same guard, assertion, caller file/line, timeout, and failure behavior must remain. No Swift helper needs to alter application state or use private APIs.

Characterization should cover: immediately hittable; absent then hittable; present but covered or offscreen before becoming hittable; and never hittable through the full timeout. Also check a realistic sheet transition. The fast path can expose a test that used the original wait's incidental latency to let a different operation settle. Diagnose that dependency rather than adding a sleep or broadening the fast path to saved labels and enabled-state gates.

The bounded-scroll change removes remaining condition queries after the search has succeeded. Retain the same maximum attempts, target, gesture, and final assertion or fallback. Test immediate success, success after scrolling, and exhaustion. Do not convert a loop whose purpose is repeated interaction or observing a condition over time. A transient hit point can still disappear before the final assertion; keep that failure visible.

Local `CGRect` reuse is the selected geometry change. Read each frame once per existing observation phase, then preserve every comparison and tolerance. Re-read after each tap, swipe, reward, or relaunch. The before/after layout tests must keep separate frames. No generic property-wait conversion, `firstMatch` substitution, or snapshot hierarchy rewrite belongs in this tranche. Public snapshots remain a separate candidate once the narrow changes are measured.

## Launch, setup, animations, and audits

### Launch and setup

**Apple fact:** `launch()` is synchronous, waits until the application can handle user events, and terminates an existing instance before launching another. It therefore establishes a different lifecycle boundary from foreground activation. [Apple: launch](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/launch()).

**Repository observation:** fixtures allocate UUID-scoped product profiles; relaunch tests intentionally preserve that UUID to observe durable state. The three earlier launch consolidations already have an assertion ledger. Keep those isolation and process-restart boundaries. Do not replace `terminate(); launch()` with `activate()` for font preferences, installed lessons, reset/recovery, or offline history. Removing an extra existence query immediately followed by an equivalent readiness check may merit measurement, but only if failure behavior and the complete original waiting allowance remain covered.

Apple advises inexpensive isolated tests and avoiding unnecessary setup in unit-test hosts. That is not permission to skip the app startup behavior a UI test accepts. Immutable fixture preparation can be considered separately from mutable profile reuse. [WWDC18: Testing Tips & Tricks](https://developer.apple.com/videos/play/wwdc2018/417/).

### Animation and idle waits

Apple acknowledges UI-query timeouts and cases where the target app does not become idle promptly; Xcode records diagnostics for these conditions. This documents a synchronization concern, not an approved public switch that disables correctness checks. [Apple: Xcode 12 release notes, XCTest](https://developer.apple.com/documentation/xcode-release-notes/xcode-12-release-notes/).

**Repository observation:** [ReferenceToolsUITests](../../native-ios/Tests/AppUITests/ReferenceToolsUITests.swift) intentionally observes a two-second paused interval and a two-second interval beyond the native scroll indicator's fade. Player tests also compare frames around real rewards and scrolls. These are temporal assertions, not unexplained sleeps. Removing them, globally disabling animations, or changing simulated media duration alters what the tests establish.

**Recommendation:** attribute long activity spans before changing synchronization. Retain existing public waiting and gesture APIs. Do not use private `XCUIApplicationProcess` methods, quiescence bypasses, swizzling, undocumented environment flags, or production animation changes. A large `Wait for ... to idle` span is a reason to diagnose the active animation or task, not proof that a shorter timeout is safe.

### Accessibility audits

**Apple fact:** an accessibility audit evaluates the current screen, and Apple recommends auditing each screen in a workflow. `performAccessibilityAudit` runs the same categories of checks as Accessibility Inspector. Passing audits does not establish complete accessibility; assistive-technology testing remains necessary. [Apple: Performing accessibility audits](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app).

**Repository observation:** `VoiceOverSemanticsUITests.auditPrincipalScreens` audits eight screen states in light, dark, and largest-text configurations. Each call already combines the required VoiceOver audit types and the retained visual audit types. Snapshot label assertions and an audit are different observations. The visual findings are non-gating but intentionally retained evidence.

**Recommendation:** preserve all screen/configuration combinations and audit types. First measure navigation, the audit call itself, and issue formatting separately. The issue handler reads three element attributes per finding; a single per-issue snapshot could be tested if those reads are material, while preserving issue type, description, identifier, label, and attachment. Do not presume audit cost can be removed by consolidating the surrounding label checks. Moving visual audits to another gate would be a coverage-policy decision outside this scope.

## Lower-level coverage and verification boundary

Apple recommends many isolated unit tests, fewer integrations, and UI tests for common workflows. Swift Testing supports unit tests; XCTest with XCUIAutomation remains the UI-testing path. This supports locating new combinatorial logic coverage below UI automation, not deleting current user/OS obligations. [Apple: Testing](https://developer.apple.com/documentation/xcode/testing).

The repository already has host tests for domain rules, presentation, preference drafts, storage, and controllers, plus native rendering integrations such as [PlayerLayoutRenderingTests](../../native-ios/Tests/MediaIntegrationTests/PlayerLayoutRenderingTests.swift) and [LearningRewardRenderingTests](../../native-ios/Tests/MediaIntegrationTests/LearningRewardRenderingTests.swift). These provide potential owners for future pure-value combinations. Their existence does not establish equivalence to actual taps, lazy scrolling, accessibility audits, playback, or process relaunch. No coverage move is proposed for the first experiment.

For an implementation pilot, keep application bytes and both-device scheduling unchanged. Compare the same selected test identifiers using retained test products, record every attempt, and preserve failure diagnostics. Measure full method duration as well as query/snapshot/wait activity; fewer log lines are not sufficient evidence of speed. Verify that all original assertions, timing observations, fixture variants, cardinality checks, and tolerances survive. A full two-device pass with the exact compiled inventory remains necessary before claiming complete acceptance. No automatic retries, skips, private idle bypass, or claimed percentage improvement follows from this research.
