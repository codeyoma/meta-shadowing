# Establishing the foreground test's lifecycle boundary

Date: 2026-10-09. Scope: one UI test's Home/activation setup. No production app,
runner policy, test inventory, existing timeout or navigation oracle changes.

## Failed pre-push verification

The local pre-push run of `3ff1d10` passed all 105 integration identifiers, then
`NativeFoundationUITests/testLibraryDetailForegroundAndRelaunch` failed its
five-second book-card existence assertion after returning from Home and tapping
Books. The added tab-hittability check passed, but touch synthesis reported
`Computed hit point {-1, -1}`. This was a real XCTest failure, not an inventory
aggregation error. The push was blocked and the remaining work was cancelled;
the incomplete native gate remains failed.

The retained accessibility trace shows the same valid Books-tab frame while its
window context changes from a nonzero value to zero and then a different nonzero
value. The visible point also changes between a valid point and `(-1, -1)`.
The main thread responds promptly to those queries. An unchanged passing run
has the same frame with a stable nonzero context at readiness and touch synthesis.
This implicates the lifecycle/automation boundary, not a proven book-loading or
main-thread defect.

Unchanged focused verification passed three foreground executions, and another
three following large-text executions. A separate concurrent diagnostic completed
five successful iterations before later launch/accessibility operations stalled.
Both concurrent commands were cancelled and retained as failed/cancelled results.
A stack sample showed CoreSimulator waiting in its application-launch IPC. That
additional infrastructure observation is not established as the original tap
failure's cause; no service restart or simulator erasure was performed in this
diagnosis.

## Observed missing precondition

The original test calls `press(.home)` immediately followed by `activate()`.
A separate real-app characterization retained the stage setup and the original
single Books tap/card oracle. Immediately after Home, it required `app.state` to
be either `.runningBackground` or `.runningBackgroundSuspended` before activation.
It failed on the first cycle: XCTest still reported `state=4`, which the installed
Xcode 27 SDK defines as `.runningForeground`.

This proves the immediate-observation assumption is invalid. It does not prove
the physical window was still foreground: `XCUIApplication.h` explicitly defines
`state` as the most recently observed state, with inherently asynchronous updates.
The trace and characterization support explicit lifecycle synchronization, not a
claim that every invalid hit point or CoreSimulator stall has one confirmed cause.

## Correction

The original test now uses one predicate with a five-second bound to establish
either background state before calling `activate()`. Each evaluation reads the
state once. Unknown, foreground and not-running states do not satisfy it; an
unexpected termination must not become a passing resume test. A failed boundary
records the numeric state and returns before activation.

After activation, another bounded guard requires `.runningForeground` before
navigation. The original stage-presence check, Books-tab hittability, single
normal tap, five-second card oracle and terminate/relaunch assertions remain.
Foreground state is not treated as a substitute for those UI checks.

There is no fixed sleep, coordinate fallback, second tap, automatic retry,
animation suppression, private API, assertion removal or increased original
timeout. The change is deliberately limited to the failing method; other
lifecycle journeys remain unchanged. Independent review found no blocking
correctness issues and corrected the state-observation wording above.

## Verification

The same characterization passed after inserting the lifecycle guards: twelve
Home/foreground/Books/stage round trips, one selected method, zero failures or
skips. Its method duration was 76.638 seconds and the complete tool command took
122.006 seconds. The original red result is retained separately. These durations
are diagnostic context, not a performance comparison between different workloads.

Fresh focused verification then rebuilt the corrected original test and ran the
large-text predecessor three times followed by foreground/relaunch three times.
All six executions passed, with two distinct compiled identifiers and zero
failures or skips. The foreground method durations were 19.599, 18.493 and 18.141
seconds; the complete command took 213.559 seconds. The exact-result validator
regressions also passed (10 tests, 64 assertions), as did the complete manual
shard contract, all 5,184 aggregate outcome combinations and `git diff --check`.

The characterization lives outside the shipping suite. The existing regression
method retains navigation coverage, so the complete native inventory stays at
180 cases. Focused evidence does not replace the exact-commit full gate.
The version-5 pre-push hook still requires every native case plus Debug/Release,
downloader, product and runtime checks before allowing a push.

References: Apple's [activation contract](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/activate()),
[application state](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/state-swift.property),
and [state wait](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/wait(for:timeout:)).
The installed Xcode 27 header was also inspected directly. No live-service,
physical-device, human VoiceOver or release acceptance follows from these tests.
