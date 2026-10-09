# Native UI test internal timing audit

Date: 2026-10-09. Scope: read-only analysis of retained local results and test source. This audit does not run tests, change assertions, or change simulator state. All recommendations retain the existing two dedicated simulators, the complete native inventory, and internally serial UI selections.

## Evidence and interpretation

The primary evidence is the completed two-device run documented in [the parallel results](2026-10-09-local-native-parallel-results.md): its combined `summary.json` and `tests.json`, `shard-timings.json`, and the `ui-a/native.log`, `ui-b/native.log`, and corresponding result bundles. The comparison is the preceding complete serial run documented in [the UI wait expansion](2026-10-09-ui-wait-expansion.md). Private artifact locations and simulator identities remain outside this document.

The primary summary contains 180 passed identifiers, zero failures, and zero skips: 105 integrations and 75 UI methods. Its measured whole-run time is 1,745.104 seconds; the UI phase is 1,263.675 seconds. UI A's command took 1,262.593 seconds and UI B's took 1,256.275 seconds. The workers overlap, so their durations must not be added as wall time.

This note uses three distinct evidence levels:

- **Measured:** method durations from the finalized case tree, event counts and timestamp differences from retained logs, and activity start times returned by read-only `xcresulttool` queries.
- **Inferred:** consecutive top-level evaluations of the same predicate represent one wait; a passing method that moves on after one evaluation satisfied that wait at its first logged check.
- **Hypothesized:** an immediate readiness query, fewer redundant accessibility queries, or local frame reuse will reduce time without altering outcomes. These require a controlled pilot. No speedup from these proposed changes has been measured.

XCTest logs give activity start times, not reliable completion boundaries for every operation. An inclusive span runs from an activity to the next event at the same or shallower indentation. An adjacent span runs to the very next timed event. Both may contain unlogged work or the scheduling delay of the following operation. These spans are diagnostic estimates, not CPU profiles or independent savings.

## Where the two workers spend time

The finalized case tree gives these method totals, rounded to three decimals. Their sum is 2,481.490 seconds of concurrent worker work, compared with 2,416.115 seconds in the preceding serial run. Parallelism reduces elapsed time; it does not reduce the amount of UI work.

| Worker | Class | Methods | Method seconds |
| --- | --- | ---: | ---: |
| A | `PlayerUITests` | 27 | 1,017.393 |
| A | `NativeFoundationUITests` | 5 | 93.755 |
| A | `DownloadLabUITests` | 4 | 90.669 |
| A | `BookshelfUITests` | 2 | 48.881 |
| B | `AppleServicesUITests` | 8 | 298.342 |
| B | `ProductUITests` | 10 | 272.980 |
| B | `ReferenceToolsUITests` | 9 | 245.545 |
| B | `VoiceOverSemanticsUITests` | 3 | 206.414 |
| B | `OfflineAcceptanceUITests` | 2 | 138.241 |
| B | `NativeMediaUITests` | 4 | 47.786 |
| B | `ProductAccessibilityUITests` | 1 | 21.484 |

The longest methods remain real journeys or appearance/stage matrices:

| Method | Two-device seconds | Prior serial seconds |
| --- | ---: | ---: |
| `OfflineAcceptanceUITests/testDownloadedLessonSurvivesOfflineRelaunchWithoutNewCredit()` | 113.751 | 108.078 |
| `AppleServicesUITests/testLocalResetClearsConfirmedProgressButKeepsDownloadedBookAfterRelaunch()` | 110.915 | 114.581 |
| `VoiceOverSemanticsUITests/testPrincipalScreensPassVoiceOverAuditsInLightAndDark()` | 108.029 | 115.349 |
| `PlayerUITests/testSubtitleToggleAppearsOnlyForHintStages()` | 90.595 | 86.165 |
| `VoiceOverSemanticsUITests/testPrincipalScreensPassVoiceOverAuditsAtLargestText()` | 74.562 | 78.401 |
| `PlayerUITests/testBriefRepeatedRewardsPreserveLayoutAndCredit()` | 68.912 | 66.294 |
| `AppleServicesUITests/testServiceConfirmationsInLightAndDarkAtLargestText()` | 61.246 | 63.316 |
| `PlayerUITests/testGroupedVideoAndSilentUseNormalPlayer()` | 56.902 | 56.934 |

These are observations from two historical runs, not a randomized comparison. Their mixed direction argues against attributing every difference to a test implementation change.

## Activity costs and overlap

The following estimates come from timed records in the two UI logs. Timestamps have 0.01-second granularity.

| Activity | Count | Summed diagnostic span, seconds | Interpretation |
| --- | ---: | ---: | --- |
| App launch | 102 | 562.31 | Inclusive launch span; includes nested termination, automation setup, idle synchronization, and possible unlogged work before the next sibling |
| Tap | 631 | 836.59 | Inclusive tap span; includes nested find, event synthesis, idle synchronization, and possible subsequent wait scheduling |
| Idle record | 1,723 | 900.69 | Adjacent interval; does not distinguish app work, XCTest synchronization, or subsequent polling delay |
| Find record | 3,927 | 567.04 | Adjacent interval; includes query resolution and any unlogged work before the next event |
| Positive existence fallback | 3 | 14.24 | Inclusive wait span; first logged checks start 3.10 seconds after the three headings in total |
| Disappearance wait | 66 | 126.38 | Inclusive wait span; first logged checks start 67.96 seconds after the headings in total |

Do not add these rows. Launches and taps contain idle/find work, and the property-wait gaps below overlap these same intervals. In particular, 567.04 seconds is not a measurement of snapshot cost. There is no standalone timed snapshot marker in the primary logs; ordinary queries still obtain accessibility state. The previous serial log has one explicit snapshot-related marker, which does not establish that other queries avoided snapshots.

For scale, the offline relaunch method contains three launches spanning 17.16 seconds, 37 taps spanning 55.48 seconds, 77 idle intervals totaling 47.73 seconds, and 113 Find intervals totaling 26.79 seconds. The subtitle matrix contains four launches spanning 21.54 seconds, 20 taps spanning 22.84 seconds, and 147 Find intervals totaling 14.25 seconds. These overlapping spans identify investigation areas; they do not justify removing launches, taps, or stage variants.

The three remaining positive existence fallbacks already wait for delayed appearance. The earlier serial run had four. The previous immediate-existence optimization has therefore already removed most avoidable positive-existence polling headings. Disappearance checks have separate temporal responsibilities and are not part of the proposed first change.

## Property waits: strong evidence for a bounded pilot

Grouping consecutive top-level identical predicate checks, while excluding the two top-level `existsNoRetry == 0` checks, gives 395 inferred property waits and 546 evaluations. Of these waits, 331, or 83.8%, finish after their first logged evaluation. The prior serial run has the same 395 inferred waits and 328 first-check successes, or 83.0%.

The broader number includes enabled, selected, and label predicates. It is not a proposal to optimize all of them. Some enabled and label waits protect real playback, pending saves, or durable checkpoints; an unchanged value observed immediately after a write is not proof that the write committed. Keep those waits unchanged in the first tranche.

Hittability alone has a substantial observed footprint:

| Worker | Inferred hittability waits | Predicate evaluations | First-check successes | Previous-event-to-first-check gap, seconds |
| --- | ---: | ---: | ---: | ---: |
| A | 93 | 115 | 83 | 118.83 |
| B | 107 | 148 | 78 | 171.18 |
| Combined | 200 | 263 | 161 (80.5%) | 290.01 |
| Prior serial | 200 | 262 | 158 (79.0%) | 286.40 |

At source audit time, there are 87 explicit `.wait(for: \.isHittable, ...)` calls and one receiver-implicit `wait(for: \.isHittable, ...)` inside `NumericTextFieldActions.replaceNumericText`: 88 callsites. Runtime invocations are higher because helpers and loops repeat. A conversion count must come from the reviewed patch, not this source inventory.

The 290.01-second total is **not removable delay**. It begins at the preceding log event, which can be an idle operation or query. The 161 first-check successes account for 210.05 seconds of those gaps, with the same limitation. A first logged success also does not establish that the element was hittable when the wait was originally called. It may have become hittable during the initial interval.

The narrower evidence is still useful: the options Close/navigation method has six hittability waits, all satisfied at the first logged evaluation. Its result activities independently show preceding-event gaps of 1.052, 1.746, 1.138, 1.070, 1.750, and 1.103 seconds. Four follow a Find record; two follow idle records. This repeated initial gap supports testing an immediate hittability check with the original wait as fallback.

The proposed first helper should return early only for an existing, currently hittable element, otherwise call the same original hittability wait with the same timeout. Keep every assertion and failure message. Do not extend that helper to enabled, selected, label, disappearance, media completion, or save readiness in this tranche. Immediate readiness does not guarantee permanent layout stability; verify the dependent taps and assertions under the earlier timing. The separate code audit excludes four download-lab startup callsites until their enabled readiness is independently established; that leaves 84 candidate callsites, including the numeric-field helper, subject to patch review.

## Concrete query improvements, evaluated separately

### Stop visibility loops after the target is reached

There are 28 source loops shaped like `for _ in 0..<N where !element.isHittable`. The `where` condition is evaluated for every remaining iteration even after the target becomes hittable. The current player fixture uses a ten-iteration stage loop, followed by a hittability assertion and conditional tap. In the options-order method, the first stage produces twelve consecutive stage Find records from 9.92 to 10.74 seconds before the tap, consistent with those source reads.

A bounded loop with `guard !element.isHittable else { break }` can stop these repeated remote queries while retaining the maximum swipe count, swipe direction, and final hittability assertion. Keep each loop's existing gesture and endpoint; the graph, large-text, and list scrolling paths have different gestures. This is a testable query reduction, not yet a measured saving. Reject the change if any target becomes unreachable or an existing final assertion fails. It should be measured separately from the hittability-wait helper.

### Reuse frames within one static assertion block

The options-order test reads `row.frame.minY` and then `row.frame.maxY` without an intervening action. Across its two stage variants, this produces twelve pairs of consecutive Find records, one pair per row. The second Find-to-next-event intervals total 1.05 seconds. Reading `let frame = row.frame` once per row preserves both original geometric comparisons against the same observed frame.

This is a small, concrete candidate. Do not reuse frames across taps, scrolling, confirmation, reward disappearance, or relaunch. Several player tests deliberately compare geometry before and after an action; their new measurement must remain a fresh read. A public per-element snapshot can be considered only when multiple attributes describe the same static observation. The retained traces do not establish that a snapshot is faster than one frame query.

### Retain accessibility audits and measure their boundary

The principal-screen tests call `performAccessibilityAudit` on eight surfaces for light, dark, and largest-text configurations: 24 audit calls. Their enclosing methods total 182.591 seconds, including launch and navigation. The result activities do not expose a distinct duration for every audit call, so this audit cannot honestly assign that total to accessibility auditing.

The light/dark method has 512 Find records with 39.13 seconds of adjacent intervals; the largest-text method has 149 with 30.76 seconds. The source's issue handler reads an issue element's type, identifier, and label for retained findings, and the traces contain repeated element resolutions during those audits. These observations justify adding explicit test activities around each audit in a future measurement; they do not justify dropping audit types, issue metadata, surfaces, appearances, or the largest text size. Normal VoiceOver gate behavior remains unchanged.

## Focused measurement plan

No experiment in this section has run. Use the same existing two-device configuration for final verification; do not provision another simulator. For a focused A/B comparison, execute the same selected methods serially on the same existing dedicated destination, with no concurrent build or other test command. Keep complete before/after products and result bundles, and retain every failure without automatic retry.

Start with these three existing methods:

| Method | Baseline seconds | Hittability checks | Purpose |
| --- | ---: | --- | --- |
| `PlayerUITests/testOptionsSheetHasOneCloseAndAListExit()` | 49.106 | 6 waits, 6 first-check successes | Two launches, options Close, nested editor navigation, and exit; useful readiness-fast-path signal |
| `AppleServicesUITests/testServiceConfirmationsInLightAndDarkAtLargestText()` | 61.246 | 10 waits, 8 first-check successes | Both appearances at largest text; the two startup waits each need a second evaluation, while later navigation exercises ready controls |
| `BookshelfUITests/testGrayCardCancelsAndRetriesWithInlineDownloadProgress()` | 30.709 | 2 waits, neither first-check success | Guards real delayed readiness: the installation target requires eleven evaluations in the retained run |

The four-stage subtitle method is a useful follow-up: 90.595 seconds, eight hittability waits, all eight satisfied at the first logged evaluation. Retain all four launches and stage variants. The offline and reset/relaunch journeys should remain in complete verification, including their unchanged enabled, label, and checkpoint assertions.

Measure method duration and the complete test-command wall interval separately. Compare original/changed/changed/original runs when practical, with identical app sources, selected identifiers, launch arguments, and timeout values. Characterize the helper against immediately hittable, existing but not yet hittable, initially missing then hittable, and never-hittable elements. A permanently missing element must fail through the original timeout rather than through an unsafe property read. These characterization cases establish the helper boundary; existing product methods establish the dependent behavior.

Before claiming a whole-run gain, execute the complete unchanged inventory through the two-device runner and require the exact union of all 180 compiled identifiers, zero failures/skips, and both worker results. Report total time, UI-phase time, and each worker time. The workers are already closely balanced; improving only one worker cannot subtract its full method savings from the parallel critical path.

The existing [option-row pilot](2026-10-09-native-wait-pilot-results.md) and [shared-helper expansion](2026-10-09-ui-wait-expansion.md) retain their intentionally failing original characterization controls. This read-only audit creates no new failed or passing test attempt and does not replace those records. It establishes no new native acceptance, hosted CI, physical-device, Apple-service, or human VoiceOver result.
