# Local native full-test timing audit

Date: 2026-10-09. Revision under investigation: `9a02def`.

The approximately 47-minute pre-push run is dominated by UI automation, not compilation. The 78 UI tests consume 2,669.439 seconds, or 44 minutes 29.439 seconds. This is 94.243% of the reconstructed 2,832.519-second run. Moving this suite from automatic hosted CI to the local hook moves the wait; it does not reduce the work.

This audit reads an existing successful result. It does not run tests, change the hook, launch a simulator, change product behavior, or alter test selection.

## Evidence and counting boundary

The private local evidence root, relative to the repository, is:

```text
.git/native-pre-push/run-20261009-84109-pw975n/
  runner.log
  results/native-full.XCSkZ6/
    build.log
    enumeration.log
    inventory.json
    selection.json
    native.log
    native.xcresult/
    summary.json
    tests.json
```

`summary.json` reports 183 passed test identifiers, zero failures, zero skipped tests, and zero expected failures. `tests.json` contains the same 183 test-case nodes. This comprises 78 UI XCTest methods, 19 integration XCTest methods, and 86 Swift Testing declarations. The summary's per-device count of 235 includes parameter expansion; it is not a replacement for the 183-identifier inventory contract. The six host package suites, currently 375 cases, are a separate check and are not part of this pre-push simulator timing.

`summary.json` records a test-session start of `1791484356.897` and finish of `1791487079.196`, giving 2,722.299 seconds. `native.log:11545` independently reports 2,722.222 seconds for Xcode's test operation. The small difference reflects different timer boundaries.

The full-runner evidence interval, from creation of `toolchain.log` to the last write of `tests.json`, is 2,832.519 seconds, or 47 minutes 12.519 seconds. Rounded to whole seconds, this reproduces the reported 47 minutes 13 seconds. This interval excludes earlier hook checks/archive extraction and later snapshot cleanup/cache publication. The hook does not record a monotonic timer for those steps.

## Phase breakdown

These phase estimates use adjacent log-file creation times. Shell redirection creates each phase's log immediately before its command. Therefore the intervals include command startup, shell checks, and the transition to the next phase. They are reconstructed wall intervals, not instrumented CPU measurements. Empty logs still have useful creation times; their modification times alone would undercount a quiet build.

| Phase | Reconstructed seconds | Evidence |
| --- | ---: | --- |
| Toolchain, simulator inventory, selection, project generation | 0.307 | `toolchain.log` creation to `build.log` creation |
| Debug build-for-testing | 33.532 | `build.log` creation to `debug-product.log` creation |
| Debug product inspection | 1.820 | `debug-product.log` creation to `release-build.log` creation |
| Release build | 39.970 | `release-build.log` creation to `release-product.log` creation |
| Release product inspection | 0.404 | `release-product.log` creation to `service-build.log` creation |
| Fictional downloader build | 8.170 | `service-build.log` creation to `runtime-inspection.log` creation |
| Runtime guard regression | 0.787 | `runtime-inspection.log` creation to `bootstatus.log` creation |
| Simulator readiness | 0.153 | `bootstatus.log` creation to `enumeration.log` creation; no boot phase log exists |
| Test enumeration and inventory validation | 21.915 | `enumeration.log` creation to `native.log` creation |
| Native test command and result finalization | 2,724.029 | `native.log` creation to `summary.log` creation |
| Summary and case export | 1.431 | `summary.log` creation to `tests.json` last write |
| Total recorded interval | 2,832.519 | First log creation to final case export |

The native command includes:

| Test segment | Seconds | Exact log evidence |
| --- | ---: | --- |
| All 78 UI XCTest methods | 2,669.439 | `native.log:10651` |
| All 19 integration XCTest methods | 10.308 | `native.log:10817` |
| All 86 Swift Testing declarations | 35.609 | `native.log:11544` |
| Remaining native-command overhead | approximately 8.673 | 2,724.029 minus the three segment durations |

The residual contains runner launch/install/setup, transitions between test frameworks, logging, and result finalization. It cannot be attributed exclusively to simulator startup. The test-method durations already include each method's app launches, assertions, navigation, and teardown.

Compilation plus the downloader phase totals approximately 81.672 seconds. Even eliminating all three phases would remove only 2.883% of this recorded run. Exporting results takes approximately 1.431 seconds. Neither explains the 47-minute wait.

## UI suite distribution

Durations below sum the exact `durationInSeconds` values of each suite's test-case nodes in `tests.json`. They match the rounded XCTest suite summaries in `native.log`.

| UI suite | Methods | Seconds |
| --- | ---: | ---: |
| `PlayerUITests` | 27 | 1,108.369 |
| `AppleServicesUITests` | 9 | 306.745 |
| `ProductUITests` | 12 | 304.597 |
| `ReferenceToolsUITests` | 9 | 271.688 |
| `VoiceOverSemanticsUITests` | 3 | 218.425 |
| `OfflineAcceptanceUITests` | 2 | 163.992 |
| `NativeFoundationUITests` | 5 | 96.157 |
| `DownloadLabUITests` | 4 | 84.278 |
| `NativeMediaUITests` | 4 | 47.109 |
| `BookshelfUITests` | 2 | 40.128 |
| `ProductAccessibilityUITests` | 1 | 27.950 |

`PlayerUITests` alone takes 18 minutes 28.369 seconds. The ten slowest methods total 848.915 seconds, or 14 minutes 8.915 seconds: 31.8% of UI time and 29.97% of recorded full-run time. Optimizing only outliers leaves most UI time untouched.

## Ten slowest test methods

Source locations are repository-relative. Log lines point to the corresponding passed-method duration in `native.log`.

| Test | Seconds | App launches | Source and duration evidence | Work preserved by the test |
| --- | ---: | ---: | --- | --- |
| `OfflineAcceptanceUITests/testDownloadedLessonSurvivesOfflineRelaunchWithoutNewCredit()` | 133.155 | 3 | `native-ios/Tests/AppUITests/OfflineAcceptanceUITests.swift:31`; log `2440` | Download, explicit credit, durable settings, offline process relaunch, local source navigation, removal, denied offline reacquisition, online retry |
| `VoiceOverSemanticsUITests/testPrincipalScreensPassVoiceOverAuditsInLightAndDark()` | 117.459 | 2 | `native-ios/Tests/AppUITests/VoiceOverSemanticsUITests.swift:88`; log `10528` | Eight principal screen/control surfaces in each appearance, accessibility audits, and reachability |
| `AppleServicesUITests/testLocalResetClearsConfirmedProgressButKeepsDownloadedBookAfterRelaunch()` | 111.862 | 3 | `native-ios/Tests/AppUITests/AppleServicesUITests.swift:251`; log `756` | Bundled/installed confirmations, saved settings, two process relaunches, local reset, retained download, zero unintended credit |
| `PlayerUITests/testSubtitleToggleAppearsOnlyForHintStages()` | 95.522 | 4 | `native-ios/Tests/AppUITests/PlayerUITests.swift:375`; log `6719` | Four stages: 1, 5, 7, 9; hide/reveal semantics and no credit |
| `VoiceOverSemanticsUITests/testPrincipalScreensPassVoiceOverAuditsAtLargestText()` | 75.732 | 1 | `native-ios/Tests/AppUITests/VoiceOverSemanticsUITests.swift:99`; log `9903` | Principal screens at the largest accessibility text size, including scroll-reached controls |
| `PlayerUITests/testBriefRepeatedRewardsPreserveLayoutAndCredit()` | 69.355 | 2 | `native-ios/Tests/AppUITests/PlayerUITests.swift:51`; log `3032` | Two confirmations at normal and largest text sizes; reward disappearance, stable layout, durable credit |
| `PlayerUITests/testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages()` | 65.030 | 2 | `native-ios/Tests/AppUITests/PlayerUITests.swift:146`; log `5140` | Six option rows, order, editor entry, no credit in audio stage 1 and silent stage 11 |
| `PlayerUITests/testGroupedVideoAndSilentUseNormalPlayer()` | 64.045 | 2 | `native-ios/Tests/AppUITests/PlayerUITests.swift:641`; log `3977` | Native grouped video completion, actual player layout, saved display preference, silent mode without video resources |
| `AppleServicesUITests/testServiceConfirmationsInLightAndDarkAtLargestText()` | 62.584 | 2 | `native-ios/Tests/AppUITests/AppleServicesUITests.swift:72`; log `1048` | Service controls and destructive confirmations in both appearances at largest text |
| `ProductUITests/testLearningSettingsSummariesFollowSavedOptionsAcrossRelaunch()` | 54.170 | 2 | `native-ios/Tests/AppUITests/ProductUITests.swift:32`; log `7663` | Five setting summaries, committed edits, reset, process relaunch, persisted values |

The long tests mostly combine important journeys or appearance/stage variations. Their lengths do not establish a production defect, an infinite wait, or an unnecessary assertion.

## Launches, polling, and teardown

The 78 UI methods contain 105 actual `Launch com.example.metashadowing.ci` records. The extra launches come from explicit relaunch checks and loops over stages, appearances, and text sizes. Counting method declarations alone misses this work.

Parsing XCTest's relative `t = ...s` records gives these diagnostic estimates:

| Quantity | Estimate | Interpretation |
| --- | ---: | --- |
| Inclusive launch spans | 531.590 seconds across 105 launches | From each Launch record to the next event at the same or shallower indentation; includes termination of an existing app, automation setup, and launch idle synchronization |
| Adjacent-event spans after idle records | 884.470 seconds across 1,611 idle records | From an idle record to the next timed event; includes framework bookkeeping and can overlap the inclusive launch measure |
| Delay from existence-wait heading to first logged check | 331.220 seconds across 318 headings | Minimum 1.00 seconds, median 1.04 seconds, maximum 1.09 seconds in this run |
| Teardown-to-method-end spans | 19.490 seconds across 78 methods | Approximation from Tear Down record to the method's reported duration |

These estimates are not disjoint and must not be added. Their timestamps have 0.01-second granularity. The idle figure does not isolate actual application work from XCTest synchronization or event-reporting overhead.

The advertised `Waiting 5.0s`, `10.0s`, or `20.0s` text is a maximum timeout, not elapsed wait time. For example, result activities for `testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages()` show its six already displayed option-row existence checks taking approximately 1.107–1.175 seconds each, despite a five-second maximum. Its two player-disappearance waits take approximately 2.143 and 2.160 seconds. These durations come from sibling activity start times in `xcresulttool get test-results activities`, independently confirming the log interpretation.

The 331.220-second first-check sum is an investigation ceiling, not promised savings. Some waits guard real asynchronous work. An immediate existence precheck still costs a UI snapshot and must retain the original fallback wait. Changing every timeout to a smaller number would not remove successful first-poll scheduling and would make slow valid transitions more fragile.

No explicit `Thread.sleep`, `Task.sleep`, or `sleep(...)` calls are present in `native-ios/Tests/AppUITests` at the audited source revision. Actual native playback, animations, accessibility audits, transfer fixtures, and durable saves still require elapsed time.

## Falsifiable experiments

No experiment below has been executed by this audit. Use an isolated disposable copy of the same committed revision and the same fictional test products. Capture identical inventory and final executed identifiers. Change one variable at a time, retaining raw results and original failures.

1. **Immediate check with unchanged existence-wait fallback.** Start with the six option-row checks in `testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages()`. Try `element.exists || element.waitForExistence(timeout: originalTimeout)`. Preserve the asserted state and all row-order/editor/credit assertions. Record time for both stage variants and deliberately delayed appearance. Reject if the delayed case loses the wait or a timing race appears. The measured first-check delays make this a testable several-second opportunity in one method, not proof of a five-minute suite saving.
2. **Measure synchronization around UI actions.** Add test-only activities around launch, taps, accessibility audits, native completion, and durable-save waits. Use the same journeys and process boundaries. Compare these exact intervals to the existing 884.470-second adjacent idle estimate. Reject any optimization that bypasses native completion, disables important animation behavior under test, or treats an uncommitted edit as saved. Global idle suppression has no demonstrated safety from this evidence.
3. **Pilot two isolated serial selections on the local machine.** Reuse one immutable build product and two dedicated disposable simulators. Keep each selection internally serial. Validate disjointness, completeness, 183 exact identifiers, no failures/skips, and no shared profile/simulator mutation. Compare total wall time and resource contention to this serial baseline. Ideal division of the UI durations is an estimate only; simulator contention, duplicate runner setup, and memory pressure can erase the gain. Do not run multiple selections against the same simulator.
4. **Test the existing four manual-full selections locally without weakening inventory checks.** Record actual per-selection times before balancing. The suite table above is not enough to allocate `PlayerUITests`, because `player-options` splits that class by methods. Require the union of executed identifiers to equal the compiled full inventory exactly, with no overlap. More shards are useful only when the actual local critical path improves and every selection settles successfully.
5. **Evaluate compilation reuse separately.** Any immutable build cache must bind the pushed revision, complete configuration, toolchain, target architecture, and full-test contract. Reusing stale products changes the evidence. Since all builds take approximately 81.672 seconds here, prioritize UI experiments first. The existing exact-commit successful-pass cache already avoids rerunning a completed result after an unchanged-commit push retry.

An apparent speedup from dropping a loop, relaunch, appearance, stage variant, accessibility audit, real media completion, or durable checkpoint assertion is a coverage change. It is not a timing improvement under the current contract. In particular, shortening or synthesizing media completion would undermine the rule that a resume or elapsed time alone cannot confirm practice.

## Reproduction without running tests

Read the existing summary and case tree:

```sh
xcrun xcresulttool get test-results summary --path <existing-native.xcresult>
xcrun xcresulttool get test-results tests --path <existing-native.xcresult>
xcrun xcresulttool get test-results activities \
  --path <existing-native.xcresult> \
  --test-id 'PlayerUITests/testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages()'
```

For phase reconstruction, read file creation times with `File.stat(path).birthtime`, not only modification times. Sort by creation time and subtract adjacent phase-log creation times. This method is valid for this retained local APFS evidence; a copied artifact may have different creation timestamps.

For the UI diagnostics, parse only the 78 UI methods. A launch is a timed record whose title begins `Launch `; count its inclusive span until the next timed record at the same or shallower indentation. An idle/existence-heading diagnostic interval ends at the next timed record. Test duration comes from the passed-method record. Keep these diagnostic intervals separate from the authoritative method/suite totals.

The governing implementation is `native-ios/scripts/test-native-full.sh` (serial test-without-building plus enumeration and result validation) and `native-ios/scripts/native-pre-push.rb` (immutable pushed-commit snapshot and exact successful-pass cache). The audit does not claim a hardware, live CloudKit, Apple-hosted delivery, physical offline, or human VoiceOver acceptance result.
