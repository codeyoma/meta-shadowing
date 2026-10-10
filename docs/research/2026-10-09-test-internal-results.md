# Reducing work inside native UI tests

Date: 2026-10-09. Scope: test-only query and readiness optimization. The existing
two-device runner, internally serial selections, complete native inventory,
application behavior, and CI policy remain unchanged. Runtime verification is
complete for the final corrected snapshot: all 180 native identifiers pass.
Two earlier unsuccessful attempts remain documented below. Timing comparisons
are observational, and the final run follows an explicitly approved simulator
service recovery.

## Findings and selected scope

Three independent agents examined [Apple guidance](2026-10-09-test-internal-apple.md),
[retained execution timing](2026-10-09-test-internal-timing.md), and
[source-level candidates](2026-10-09-test-internal-candidates.md), then reviewed
one another's proposals. The owner approved the bounded first tranche.

The previous two-device run contains 102 app launches and 631 taps. Their
inclusive activity spans include accessibility queries, event synthesis and
idle synchronization. These overlapping spans are not additive savings. The
application's business logic is not the only cost of testing a real UI.

The patch keeps all 75 UI method identifiers and the complete 180-case native
inventory. It does not delete a test, shorten a timeout, replace native playback,
remove a relaunch, skip an accessibility audit, disable animations, or bypass
XCTest's idle synchronization. It changes three sources of redundant work:

1. **84 navigation/editing readiness checks** use `hittableOrWait(timeout:)`.
   It succeeds immediately only when the element exists and is hittable;
   otherwise it invokes the original XCTest property wait with the original
   timeout. Four download-lab startup gates remain unchanged because readiness
   there also depends on asynchronous initialization. All enabled, selected,
   label, media/save, and disappearance waits remain unchanged.
2. **28 bounded scroll searches** break as soon as their target is hittable.
   The former `for ... where !isHittable` syntax queried the target for every
   remaining iteration even after finding it. Each maximum swipe count, target,
   gesture direction, subsequent assertion, and actual tap remains unchanged.
3. **Static observation blocks** reuse immutable `CGRect` or string values.
   This removes 23 repeated frame reads and four repeated label reads in source;
   loops can multiply these calls at runtime. Every action, wait, screenshot,
   and before/after layout comparison retains its own fresh observation.

No global `firstMatch` conversion or accessibility hierarchy snapshot rewrite
is included. Those alternatives have ambiguity/order or stale-state tradeoffs
that are unnecessary for this first tranche.

## Preservation review

An independent semantic review found no actionable issues. A separate structural
comparison against the exact pre-change UI source verified the same 75 test
identifiers, 801 assertions, 13 `XCTFail` calls, and five `XCTUnwrap` calls.
Assertion arguments match after expanding only the approved immutable aliases
and readiness-helper spelling. Messages, expected strings, tolerances, gesture
arguments, screenshot/attachment calls, and relaunches remain unchanged.

All 167 non-hittability property waits remain unchanged. The 28 scroll loops
retain their bounds, targets, and gesture bodies. The four excluded lab startup
waits retain their original expressions. This is source-preservation evidence,
not runtime acceptance or a timing result. The foreground follow-up below adds
one readiness assertion without removing any of these original assertions.

## Real-UI helper characterization

A separate small SwiftUI application uses a copy of the actual shared helper.
Its UI tests exercise an immediately hittable button, an initially missing
button appearing after 2.5 seconds, an existing offscreen button, and a button
that never appears. It is separate from the application's native inventory.

With the original wait-only helper, the ready-button test fails its 2.4-second
budget for three already-ready queries; the other three cases pass. The
intentional failure is retained as red evidence. With the implemented helper,
all four cases pass. The offscreen and missing cases both require a false result
after at least 4.9 seconds of the unchanged five-second wait. Presence alone
therefore cannot make a non-hittable element pass. No mock accessibility element
is substituted.

## Product verification and measurement

The isolated source snapshot retains byte-identical production, configuration,
and fixture inputs relative to the previous two-device experiment. Only UI-test
source changes are part of this optimization. Private local configuration is
excluded. The focused comparison selects the same four compiled identifiers:

- `PlayerUITests/testOptionsSheetHasOneCloseAndAListExit`
- `AppleServicesUITests/testServiceConfirmationsInLightAndDarkAtLargestText`
- `BookshelfUITests/testGrayCardCancelsAndRetriesWithInlineDownloadProgress`
- `ProductUITests/testExperiencePopoverShowsCurrentLevelWithoutChangingProgress`

Both variants run serially on the same dedicated iOS 27 destination with no
concurrent build or other test command. Original result bundles and failures
are retained. The unchanged complete two-device gate was then executed.
Method-duration sums, command duration, complete-run wall time, and startup
observations are reported separately below.

### Focused before/after result

Both four-method selections pass with zero failures, skips, or expected failures.
Their finalized summaries and case trees match the exact compiled selection.

| Measure | Original | Optimized | Observed reduction |
| --- | ---: | ---: | ---: |
| Test-command wall time | 205.539 seconds | 196.226 seconds | 9.313 seconds (4.5%) |
| Sum of method durations | 171.427 seconds | 158.334 seconds | 13.093 seconds (7.6%) |

| Method | Original seconds | Optimized seconds |
| --- | ---: | ---: |
| Largest-text light/dark service confirmations | 85.249 | 82.453 |
| Gray-card cancellation, retry and delayed installation | 24.902 | 24.799 |
| One Close control and list exit in player options | 49.653 | 40.768 |
| XP popover and header geometry | 11.623 | 10.314 |

This is one sequential same-machine pair, not randomized or repeated evidence.
It measures the three test-only changes together, not their separate effects.
The command includes test-session startup but excludes the preceding build and
simulator boot. Method times include launch and UI interaction. Host startup
load and unrelated activity varied, so neither percentage is a general speed
guarantee or a prediction for the whole suite. The delayed-download case is
intentionally almost unchanged: its genuine transfer wait remains intact.

### First complete attempt: failed and retained

The first complete attempt passed all 105 native integration identifiers, then
`NativeFoundationUITests/testLibraryDetailForegroundAndRelaunch` failed its
existing five-second book-existence assertion after foreground activation.
The log shows the stage still existed immediately after activation, but the
subsequent Books-tab tap computed a hit point of `{-1, -1}`. The test did not
explicitly wait for that tab to become hittable before tapping it.

The only optimization earlier in that method was the initial book-readiness
helper, which entered the original fallback and evaluated twice in this run.
This attempt therefore does not establish that its immediate path caused the
later failure. The observed missing hit point supports a narrowly scoped
readiness correction; it does not prove a production navigation or XCTest bug.

After retaining the assertion failure and original logs, both owned UI commands
were cancelled rather than continuing a known-failed full run. Their original
result bundles remain available. The run returned failure after 775.540 seconds;
it is not a speed benchmark or a passing result. The destination supervisor
settled the test processes/devices and released its ownership markers.

The follow-up adds a five-second hittability assertion for the existing Books-tab
query immediately before its single tap. The original stage, book, and process
relaunch assertions and their timeouts remain unchanged. There is no extra tap,
sleep, automatic retry, or timeout increase. Independent review found this a
scoped strengthening of the action precondition. Focused verification and a fresh
complete two-device run must establish the correction's result.

The corrected foreground/relaunch method passed focused verification with its
exact selected identifier, zero failures/skips, and a 22.881-second method
duration. This confirms that attempt passed with the stronger precondition;
it does not establish the root cause of every possible activation failure.

### Second attempt: simulator startup blockage

The next complete attempt again passed all 105 integration identifiers. Neither
UI worker reached a test case. Read-only process samples placed one worker in
CoreSimulator's application-launch IPC and the other in application-install IPC.
The installer sample was scanning system-app bundle directories. A narrow system
log query also found an XCTest-daemon connection-channel refusal. These are
startup-infrastructure observations, not failures in the optimized test bodies.
High host load and swap usage were correlated observations, not a proven cause.

This attempt was cancelled through its owner and returned failure after 802.915
seconds. It cannot establish UI acceptance or a full-run speed comparison.
Its original artifacts remain separate from both the first failure and recovery.

With explicit owner approval, the three running simulators (the two dedicated
test devices and W2) were shut down, the verified user-owned CoreSimulator
service was restarted, and W2 was booted again. No simulator was erased, deleted,
or recreated. No production/physical app was replaced. The next full attempt
uses byte-identical corrected UI-test source; this is an environment-recovery
attempt, not an additional code fix or an automatic retry policy. A passing
recovery would not prove the underlying install/launch stall permanently fixed.

### Completed recovery verification

The final complete gate passes the same **180 exact compiled identifiers** as
the preceding two-device baseline: integrations 105, UI A 38, and UI B 37.
All three finalized summaries contain zero failures, skips, and expected
failures; exact selected/combined case validation and unchanged-product checks
pass. Debug, Release, downloader, and runtime-inspection checks also pass.
The corrected foreground/relaunch method passes within this concurrent full
run in 19.246 seconds. Its additional readiness assertion retains all original
assertions; there are now 802 source assertions, rather than the initial 801.

| Measure | Previous two-device baseline | Final corrected run | Observed reduction |
| --- | ---: | ---: | ---: |
| Complete monotonic runner time | 1,745.104 seconds (29m 05s) | 1,500.791 seconds (25m 01s) | 244.313 seconds (14.0%) |
| Overlapping UI phase | 1,263.675 seconds (21m 04s) | 1,184.620 seconds (19m 45s) | 79.055 seconds (6.3%) |
| Sum of all UI method durations | 2,481.490 seconds | 2,292.568 seconds | 188.921 seconds (7.6%) |
| Native identifiers passed / failed / skipped | 180 / 0 / 0 | 180 / 0 / 0 | Same identifiers |

The complete timer includes builds, product checks, simulator preparation,
enumeration, all three selections, result validation and verified shutdown.
The UI phase uses first UI-command log creation through combined case-tree
export, matching the earlier report. Worker times overlap and must not be
added as elapsed time. Final command times are 94.117 seconds for integrations,
1,167.401 seconds for UI A and 1,183.677 seconds for UI B.

The **14.0% whole-run reduction must not be attributed entirely to the code
patch**. The final run follows infrastructure recovery, and the baseline
included the second simulator's first boot. Even the unchanged integration
command changed from 168.604 to 94.117 seconds. Host load, caches, startup, and
unrelated activity were not controlled. The UI method-duration reduction is
7.6%, consistent with the separate focused pair, but still not a randomized
repeatability claim. Individual classes did not all improve: Bookshelf and
Product method sums increased slightly. No universal speed guarantee follows.

At completion, both explicitly selected test devices are Shutdown, their
destination leases and the repository lease are absent, and W2 remains Booted.
The original unsuccessful artifacts remain separate. No test was removed or
skipped to obtain the final pass, and no automatic retry policy was added.

This establishes local native acceptance for the tested snapshot, not hosted
CI, physical-device behavior, live Apple services, or human VoiceOver behavior.
The unchanged host package suites were not rerun for these UI-test-only edits.
No commit, push, remote configuration change, or hook pass-cache entry was made.

### Subsequent pre-push verification

The later local pre-push run of `3ff1d10` reproduced the foreground/relaunch
failure despite the tab-hittability assertion. Its push was blocked. The original
successful snapshot result above remains historical evidence, not a pass for that
later run. See [the lifecycle-boundary investigation and correction](2026-10-09-foreground-test-synchronization.md)
for the retained failure, the red/green real-app characterization and the narrowly
scoped synchronization change. The whole native gate remains mandatory.
