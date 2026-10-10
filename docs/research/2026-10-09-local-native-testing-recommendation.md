# Local native test speed: evidence and proposed next steps

Date: 2026-10-09. Source baseline: `9a02def`. Status: research and design proposal, not an implemented optimization.

## Conclusion

The long local run is not an unavoidable cost of Swift or iOS. This particular suite spends almost all of its time in serial, cross-process UI automation. A comprehensive UI suite can take tens of minutes, but the inspected sources do not establish a universal or statistically representative industry runtime. Moving execution from GitHub to a Git hook changed where the time is spent, not how much work is performed.

The recommended direction is to reduce unnecessary UI automation while retaining its unique evidence, then use measured, limited parallelism. Build caching is a secondary opportunity. Do not move the long work to another gate again and call that a speed improvement.

## Measured baseline

The retained successful local result was re-read and its compiled inventory validated during this investigation. No new native run or performance experiment was performed.

| Work | Recorded duration |
| --- | ---: |
| Full runner evidence interval | 47m 12.519s |
| 78 UI test methods | 44m 29.439s, 94.243% of the interval |
| 105 native integration identifiers | 45.917s of test-body time |
| Debug, Release, and downloader builds combined | 81.672s |
| Enumeration and inventory validation | 21.915s |
| Result exports | 1.431s |

The full-runner interval is reconstructed from retained file creation/write times; it excludes earlier hook checks/archive extraction and later cleanup. Test-body and command intervals have different boundaries. The full simulator result contains 183 identifiers with zero failures or skips. Parameterized argument runs must not be confused with this identifier count. Details, source locations, limitations, and reproduction instructions are in the [timing audit](2026-10-09-local-native-testing-timing.md).

Across 78 UI methods, the log records 105 application launches, 631 taps, and 318 existence waits. Initial existence polling contributes approximately 331 seconds of observed delay before the first logged check. That is not a promised saving: genuine asynchronous transitions and accessibility snapshots still take time. Launch, idle, and polling estimates overlap and must not be added together.

`PlayerUITests` alone takes 18m 28.369s. Merely enabling class-level parallelism leaves that class as a long indivisible task. An offline two-bin assignment of current UI class durations has a 22m 20.506s critical bin, before integration, build, worker startup, and contention. This is scheduling arithmetic, not a prediction or benchmark.

## What the sources support

- Apple recommends many focused unit tests, fewer integration tests, and a small set of system/UI workflows. It also distinguishes process-based XCTest parallelism from in-process Swift Testing parallelism. This supports changing the test layer for appropriate assertions, not replacing native media or accessibility evidence with mocks. [Apple research](2026-10-09-local-native-testing-apple.md); [WWDC18 Testing Tips & Tricks](https://developer.apple.com/videos/play/wwdc2018/417/).
- Wikipedia explicitly selects E2E identifiers and separates broader UI configurations. Firefox builds once and distributes UI work across five hosted workers, but still launches/terminates the application per test. Neither proves that five simulators on this 16 GiB local machine will be faster or safe. [Pinned upstream source survey](2026-10-09-local-native-testing-oss.md).
- Composable Architecture demonstrates controlled clocks and exhaustive intermediate state/effect assertions. The useful practice is controlled application scheduling, not adopting that framework or pretending a virtual clock proves AVFoundation completion. Swift Testing's host-package workflow is not a substitute for iOS runtime acceptance. [Pinned upstream source survey](2026-10-09-local-native-testing-oss.md).
- Build-for-testing followed by test-without-building and a retained dedicated simulator are already implemented here. Recommending them again would not address the measured bottleneck. [Current full runner](../../native-ios/scripts/test-native-full.sh).

## Proposed implementation sequence

### 1. Bounded pilot: remove unnecessary first polling delays

Start with the six option-row existence assertions in `PlayerUITests/testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages`, which currently takes 65.030 seconds for its complete two-stage journey. For these checks, first inspect existence immediately; if absent, keep the original condition wait and timeout. Preserve both stage variants, row geometry/order, actual editor entry, explicit exit, and zero-credit assertions.

Verify immediate success, delayed appearance, and never-appearing failure. Do not generalize this pattern to absence, animation completion, disappearance, media completion, or durable-save readiness. Those have different temporal contracts. An initial existence check can expose tests that accidentally relied on a delay; express the missing readiness condition rather than suppressing failures.

Run the same focused journey before and after the pilot on the same dedicated simulator and toolchain. Retain failures and report all attempts. This is a small, low-risk first experiment, not the main large speedup. Broader adoption requires measured benefit and equivalent behavior.

### 2. Full-inventory experiment: two isolated UI workers

Build one immutable set of products. Run all native integration tests serially, then divide every UI identifier between two dedicated identical iOS 27 simulators. Keep each worker internally serial. Existing preview/reference simulators and physical devices remain out of scope.

The combined executed inventory must equal the complete compiled inventory exactly, with no overlap, omission, failure, or skip. Both workers must settle before success or PASS-cache publication. Cancellation must drain both owned process groups and establish that guest application/test activity has stopped on the exact owned simulators. Protect the whole operation with the repository lock and per-simulator locks shared across clones/manual consumers. A host process exiting does not prove its simulator is safe to reuse. New tests must have defined default ownership. Runtime and worker configuration must participate in evidence identity before adopting this as the normal hook.

Compare wall time, per-case duration, and resource pressure against serial execution. A failure followed by a successful rerun is not proof that contention was fixed. Do not default to four or five simulators merely because an upstream hosted pipeline uses that many workers. See the [runner audit](2026-10-09-local-native-testing-runner.md).

### 3. Structural improvement: move variations to the correct test layer

Map individual assertions and parameter rows before changing execution. Candidate families are option ordering, stage-specific subtitle presentation, settings summaries, text-size layout, reward presentation, and progress geometry. Prefer the existing real SwiftUI/UIKit rendering harness and real SQLite/controller boundaries for combinations that do not require an external user interaction.

Retain genuine XCUI coverage for actual taps and hit testing, accessibility discovery/audits, scrolling, sheet/navigation ownership, foreground/background behavior, terminate/relaunch durability, download cancellation/recovery, and real native media completion. A directly invoked controller action is not proof that the visible button is wired correctly. A rendered frame is not an accessibility frame.

Every relocated check needs an explicit old-to-new assertion map and negative controls that demonstrate failure when its behavior breaks. Exact method-count equality alone cannot prove preservation of assertions, loops, or parameter rows. Keep at least the actual user journey needed to establish each distinct integration contract; do not invent a quota of UI tests to retain. The [structure analysis](2026-10-09-local-native-testing-structure.md) identifies candidate methods and the acceptance work each requires. Its progress-digit example is an equivalence rehearsal, not the recommended speed optimization: retaining that full traversal retains most of its cost. Options and subtitle matrices offer more repeated setup to remove, but their distinct stage-specific navigation and accessibility obligations still need named owners.

### 4. Secondary optimizations only after UI work

Compilation reuse can help iteration but all three measured builds total only 81.672 seconds. Keep exact pushed-source authority, private configuration exclusion, Debug/Release/downloader guards, and result validation. Reusing a PASS for a different commit because only documentation changed would alter the current explicit policy and needs a separate decision. It is not part of this proposal.

## Review and decision boundary

Six independent agents covered Apple guidance, four open-source repositories, retained timing evidence, test-layer migration, runner safety, and skeptical cross-review. See the [independent review](2026-10-09-local-native-testing-review.md) for disagreements and acceptance conditions.

Research files are the only intended changes in this turn. No application, test implementation, Git hook, workflow, test selection, remote rule, or gate has changed. No native speedup has been measured. The immediate implementation decision is the bounded existence-wait pilot above; larger migration and worker changes require their own reviewed execution design. The full local gate and simulator-free automatic GitHub checks remain intact.
