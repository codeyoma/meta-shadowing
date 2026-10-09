# UI existence waits and redundant-launch consolidation

Date: 2026-10-09. Baseline: `9a02def`, plus the previously verified option-row wait pilot. Scope: test code only; application behavior and CI execution policy remain unchanged.

## Changes

All 171 remaining positive-existence callsites use the same `XCUIElement.existsOrWait(timeout:)` helper. It queries `exists` immediately, then invokes the original `waitForExistence(timeout:)` only when needed. Caller assertions, messages, guards, and original timeout values stay at their original callsites. There were 172 original callsites; one duplicate startup wait disappears with the pre-download estimate consolidation.

Property waits for enabled, hittable, selected, label, or committed values are unchanged. Disappearance checks, explicit paused-state/idle-fade observations, real media completion, download outcomes, and accessibility audits remain unchanged. An existence check is not a stability or interactivity guarantee. New timing failures must be diagnosed, not hidden by sleeps or weaker assertions.

The [prior real-UI pilot](2026-10-09-native-wait-pilot-results.md) established the query mechanism. The new shared helper is additionally exercised by the same real-UI characterization fixture, rather than a mock element. A baseline helper containing only the original wait fails the immediate-element budget while delayed and never-appearing cases pass; the immediate-query helper must pass all three cases.

## Three removed standalone methods, all assertions retained

No audited method was assertion-free. These three methods repeated a fresh launch for checks that can execute in an existing journey under the same launch arguments, UUID-isolated profile, initial screen, default text size, and service configuration. They are consolidated, not skipped.

| Removed standalone method | Retained owner | Preserved obligations |
| --- | --- | --- |
| `ProductUITests/testExperiencePrecedesStreakWithMatchingVerticalAlignment` | `ProductUITests/testExperiencePopoverShowsCurrentLevelWithoutChangingProgress` | Exact streak accessibility query, existence, XP-before-streak order, matching vertical center at 1-point tolerance, and streak bounds within the XP control; before the existing popover tap |
| `ProductUITests/testBundledCoverRendersBlueArtwork` | `BookshelfUITests/testInstalledCardOpensStagesAndBundledMenuCannotDelete` | Original 20-second card-hittable gate, app screenshot, title-relative 40-by-20-point crop, 8-by-4-pixel sampling, all unwraps, RGB configuration, blue greater than red plus 20, and more than four qualifying pixels; before any menu interaction |
| `AppleServicesUITests/testSampleAndDownloadEstimateDoNotGrantXP` | `AppleServicesUITests/testFreeDownloadsAndSettingsHaveNoCommerceControls` | Both sample labels, estimate existence and exact content fragments, initial zero XP, no installed hosted card, available download, and no purchase confirmation; before starting the existing download |

The retained owners keep their original navigation, interaction, appearance, and post-action assertions. Assertions common to both old methods, such as initial book readiness, remain in the owner. The cover check still uses real screenshots; the XP alignment still uses real accessibility frames. Neither is replaced by a model value or a synthetic representation.

This removes three process launches, not their tested behavior. UI method count becomes 75, and complete native identifier count becomes 180 including the unchanged 105 integration identifiers. Exact compiled/executed identity validation remains authoritative; counts are descriptive, not hardcoded gate replacements. None of the removed methods has a method-specific CI shard pin. Historical run counts in existing research and CI evidence remain historical.

## Audit of the other 75 methods

Three independent read-only audits covered every UI suite and all positive-existence callsites. The previous [player/product/reference assertion ledger](2026-10-09-local-native-testing-structure.md) remains useful, with the three owner changes above superseding its standalone ownership entries.

- Keep real playback, Home/activate, unfinished checkpoint restoration, process relaunch, explicit confirmation, and save-retry tests. Similar model assertions do not establish the same user/OS behavior.
- Keep both controlled-offline journeys and the cross-book local reset/relaunch journey. They validate composition, local recovery, explicit failure, and preserved learning history rather than an isolated adapter.
- Keep Back and Close, native dictionary dismissals, copy feedback, graph scrolling/idle indicators, and largest-text reachability. These are distinct interactions, not duplicate spellings of one assertion.
- Keep accessibility audit appearances and text-size variants. Listing an accessibility element does not prove it is reachable or eligible for VoiceOver.
- Keep storage/media/download-lab probe journeys. Current contracts still assign them visible-control and process-lifecycle responsibilities. The active-playback probe explicitly observes Playing before backgrounding; the superficially similar product test does not establish that identical precondition. They cannot be labeled obsolete solely by age.

The download-and-removal method remains separate for this slice. Merging it after the free-download Settings journey would preserve most assertions but would change the immediate-post-install deletion context. The options-row stage matrix also remains: its exact synthetic stage-1 and stage-11 fixtures, six accessibility row positions, actual speed destinations, and zero XP before confirmation need careful ownership transfer before deleting the standalone method. No arbitrary UI-count quota is introduced.

## Further speed improvements

Apple recommends many isolated logic tests, fewer integrations, and selected user-like end-to-end journeys. This supports moving combinatorial representation/state coverage to existing real native-rendering and storage/controller tests, but not pretending those tests prove taps, accessibility audits, or process relaunch. [Apple Testing Tips & Tricks](https://developer.apple.com/videos/play/wwdc2018/417/).

The largest runner-only experiment remains two isolated, internally serial UI selections, with native integrations in a preceding unchanged phase. The existing [runner design](2026-10-09-local-native-testing-runner.md) requires complete inventory aggregation, destination ownership, cancellation drainage, and measurement of local contention. It is not implemented by this change. [Apple Get your test results faster](https://developer.apple.com/videos/play/wwdc2020/10221/).

Build caching is secondary: the retained baseline spent about 82 seconds in compilation versus more than 44 minutes in UI methods. Whole-suite savings cannot be inferred by multiplying the prior single-method percentage. Record actual full-run time and all failures before claiming a broad speedup.

## Verification

### Shared-helper characterization

A separate real SwiftUI fixture exposes an immediate element, an element appearing after 2.5 seconds, and an element that never appears. The fixture compiles a copy of the actual shared helper. The original wait-only implementation fails the immediate-element 0.8-second budget, while its delayed and absent cases pass (2 passed, 1 intentional regression failure). The optimized helper passes all three cases. The absent case retains the five-second timeout and asserts at least 4.9 seconds elapsed. The fixture is not added to the application's test inventory.

### Consolidated journeys

Both measurements use the same dedicated iOS 27 simulator, fictional bundle identity, serial execution, and compiled test products. No other build ran concurrently with these measurements.

| Measure | Before: six donor/owner methods | After: three retained owners | Reduction |
| --- | ---: | ---: | ---: |
| Test command, monotonic wall time | 75.795 seconds | 53.956 seconds | 21.839 seconds (28.8%) |
| Sum of method durations | 63.472 seconds | 43.048 seconds | 20.424 seconds (32.2%) |
| Passed / failed / skipped methods | 6 / 0 / 0 | 3 / 0 / 0 | All retained obligations pass |

This is one focused before/after pair, not a repeated whole-suite benchmark. It combines existence-wait changes and three launch consolidations; it does not isolate their individual contributions. Exact selected-identifier validation passed for both results.

The newly compiled complete inventory contains exactly 180 identifiers: 75 UI and 105 integration identifiers. Against the retained 183-identifier inventory, the only removals are the three methods listed above, with no additions or other omissions. Independent code review found no lost assertions or shortened timeouts. Runtime verification remains separate from that review.

### Complete native run

The unchanged complete runner passed on the dedicated iOS 27 simulator with Xcode 27.0 (27A266a), including Debug/Release builds, both product inspections, the runtime guard, the fictional downloader build, complete enumeration, all native tests, and exact result validation. The finalized summary and case tree contain **180 passed identifiers, zero failures, and zero skips**. This is 75 UI methods, 19 integration XCTest methods, and 86 Swift Testing declarations. The helper characterization fixture is separate from this inventory. No failed app test was retried to produce this result.

| Measure | Historical complete baseline | Optimized complete run | Observed reduction |
| --- | ---: | ---: | ---: |
| UI method time | 2,669.439 seconds (44m 29s) | 2,416.115 seconds (40m 16s) | 253.323 seconds (9.5%) |
| Complete recorded runner interval | 2,832.519 seconds (47m 13s) | 2,568.472 seconds (42m 48s) | 264.046 seconds (9.3%) |
| Passed / failed / skipped identifiers | 183 / 0 / 0 | 180 / 0 / 0 | Only the three consolidated wrappers removed |
| Actual UI app launches | 105 | 102 | Three redundant launches removed |

The optimized runner's independent monotonic timer was **2,568.545 seconds (42m 49s when rounded to the nearest second)**. The comparable recorded intervals use the same first-log-creation to final-case-export boundary described in the [baseline timing audit](2026-10-09-local-native-testing-timing.md); the small difference is timer-boundary overhead. The historical baseline predates the option-row pilot. Therefore this comparison includes the prior pilot, this expansion, and the consolidations together. It is a historical same-machine comparison, not repeated randomized A/B evidence or a promise of hosted CI performance. Individual suites did not all improve.

The log-based diagnostic confirms the intended mechanism: existence-wait headings fell from 318 to 4, and their summed heading-to-first-check delay fell from 331.220 to 4.100 seconds. The remaining four waits used the normal delayed-appearance fallback. These are diagnostic event spans, not independent savings to add to the overall 264.046-second reduction; immediate queries, UI synchronization, launch changes, and run-to-run variation also affect total time.

### What remains slow

UI methods still account for **94.1%** of the recorded runner interval. This change saves about four minutes, not half the suite. The longest remaining cases are light/dark VoiceOver audits (115.349 seconds), confirmed-history reset with process relaunch (114.581 seconds), offline downloaded learning and relaunch (108.078 seconds), the four-stage subtitle matrix (86.165 seconds), and largest-text VoiceOver audits (78.401 seconds).

The next large experiment should be the two-isolated-simulator design described above: keep each UI selection serial, run native integrations separately, and require the exact union of all 180 compiled identifiers with no omissions, duplicate ownership, failures, or skips. Measure actual local wall time and contention before changing the pre-push runner. This change does not enable parallel workers, alter the full-test gate, suppress idling globally, or claim those future savings. The remaining 75 methods are not declared an irreducible minimum; retiring further UI obligations requires identifying their retained behavioral owner or explicitly accepting the lost coverage.

The four-shard routing/aggregate contract and result-validator regression checks also pass, as does `git diff --check`. The six host package suites were not rerun for these test-only source edits. No commit, push, hosted CI run, physical-device acceptance, real Apple-service acceptance, or human VoiceOver acceptance is claimed. Private raw xcresults, logs, inventories, selections, and timing output are retained outside version control.
