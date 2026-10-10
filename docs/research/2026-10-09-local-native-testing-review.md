# Independent review of local native test-speed proposals

Date: 2026-10-09. Baseline: `9a02defbef3737b30a3794315507570f8e1c3985`.
This review inspected source, primary references, and retained results. It ran only the existing JSON validator, not tests, builds, simulators, or media. The Apple, open-source, timing, structure, runner, and coordinating recommendation notes were read directly.

## Decision

Accept the direction: optimize UI execution first, preserve the current full gate, and use native rendered-view integration tests with real storage for suitable variation matrices. Accept a bounded immediate-existence check with the original wait fallback as the first implementation experiment. Then evaluate two isolated UI selections, keeping native integration execution serial. Neither experiment establishes a runtime target before measurement.

The first change is deliberately small because it retains every test and assertion. The largest plausible structural improvement is reducing repeated XCUI variation execution after equivalent assertions exist below XCUI. That larger change requires an assertion map and a measured pilot; it is not established merely by calling the test pyramid an industry standard.

## Verified evidence

The retained `summary.json` reports 183 passed identifiers, zero failures, zero skips, and zero expected failures. Its case tree has 183 unique method identifiers. Running `validate-native-test-results.rb` against the retained inventory, selection, summary, and case tree returned `PASS: 183 native test cases matched the selected inventory.`

Independent phase reconstruction reproduces 2,832.518701 seconds, or 47m12.519s. The eleven UI suites total 78 methods and 2,669.439028 seconds, or 94.243% of that recorded interval. Debug compilation, Release compilation, and the fictional downloader total 81.671673 seconds. The readiness interval is 0.153044 seconds and enumeration is 21.915323 seconds. These are this run's reconstructed wall intervals, not repeatable benchmark claims. See the [timing audit](2026-10-09-local-native-testing-timing.md).

The current runner already builds test products once, enumerates them, and uses `test-without-building`. It uses serial XCTest execution and disables collected test diagnostics. The pre-push verifier archives the pushed commit and caches successful results only for its exact commit, full-contract version, toolchain, simulator, and runtime identity. A proposal to introduce these mechanisms as new savings is redundant.

Apple describes a pyramid of focused unit tests, subsystem integration tests, and fewer user-like system journeys. Its parallelism guidance requires independence and available resources. These support the proposed allocation and experimentation, not a specific XCUI count or projected local completion time. [Testing Tips & Tricks](https://developer.apple.com/videos/play/wwdc2018/417/), [Author fast and reliable tests for Xcode Cloud](https://developer.apple.com/videos/play/wwdc2022/110361/).

Pinned Firefox source configures five hosted UI workers, reusable test products, and retry settings. Its XCUI base class launches in setup and terminates in teardown. Thus it supports isolated workers but does not support sharing one running application across unrelated tests as a generally accepted optimization. Do not transfer its retry policy. [Firefox pipeline](https://github.com/mozilla-mobile/firefox-ios/blob/afcb46afdf55892e33638a2b81b3570cffb81a21/bitrise.yml), [Firefox XCUI base class](https://github.com/mozilla-mobile/firefox-ios/blob/afcb46afdf55892e33638a2b81b3570cffb81a21/firefox-ios/firefox-ios-tests/Tests/XCUITests/BaseTestCase.swift).

## Findings by priority

### P1: Identifier equality does not prove coverage equivalence after restructuring

The validator proves that the selected compiled methods ran and passed. It cannot detect a removed assertion, a shortened appearance/stage loop inside a method, or a missing parameter row omitted from the newly compiled source. The 183 identifiers include 19 parameterized declarations with 71 argument runs; the per-device count of 235 is a different counting boundary. The validator requires present argument runs to pass and be unique, but does not independently enumerate the intended parameter-value matrix.

Before replacing any XCUI variation, record each assertion, variation, destination test, and retained end-to-end evidence. Keep explicit positive and negative outcomes, committed SQLite values, and no-credit/no-autoplay checks. Preserve actual process relaunch where that is the assertion. A new compiled inventory can change legitimately after adding or moving methods; equality must remain exact against that revision's inventory. Permanently pinning the count to 183 would prevent legitimate additions and still would not protect assertion content.

### P1: Rendered views and real storage are stronger than model-only tests, but not complete XCUI substitutes

`PlayerLayoutRenderingTests` already hosts the real `LearningPlayerView` in `UIHostingController`, waits for stable nonempty geometry, and checks real SQLite state. `BookshelfSelectionRenderingTests` samples actual pixels and verifies a pending selection against the real store. These are credible destinations for geometry, appearance, and committed-state combinations.

However, calling a model action directly does not prove a physical tap reaches the control. Layout measurement identifiers are not an independent accessibility tree. A renderer cannot claim parity for XCUI hit testing, navigation reachability, actual accessibility audits, OS lifecycle transitions, or process death. Retain representative XCUI journeys covering those boundaries. Keep all current VoiceOver audit appearances and largest-text configurations until their distinct requirements have an explicitly demonstrated replacement.

### P2: Two local UI workers on 16 GiB are an experiment, not a safe default

No inspected source establishes sufficient free memory for two simulator/UI-runner stacks on this Mac. Total installed RAM is not available RAM; foreground applications, build services, simulator processes, and audio/video decoding also consume it. Apple distributes XCTest classes nondeterministically in automatic distributed mode, so class-level concurrency does not by itself balance the large `PlayerUITests` class. [Get your test results faster](https://developer.apple.com/videos/play/wwdc2020/10221/).

Prefer two explicit disjoint selections, each internally serial, using one immutable product and two separately owned identical iOS 27 destinations. Run the 105 native integration methods serially before the concurrent UI phase because they use application-hosted windows and process-global platform services. Validate each finalized result and the complete union: no overlap, omission, failure, skip, or retry. Preserve raw failures. Observe memory pressure, swap growth, actual critical-path time, and media/lifecycle reliability. Reject the default change if concurrency increases contention or introduces failures; do not respond by loosening assertions or timeouts.

Require destination locks shared across clones and manual consumers, not only the repository lock. Stop and reap both owned process groups on failure or cancellation, and establish that simulator guest test/application activity has settled before reuse. Keep locks and publish no PASS when drainage cannot be established. The [runner audit](2026-10-09-local-native-testing-runner.md) defines these ownership requirements.

### P2: Wait diagnostics and theoretical shard floors are not measured savings

The first existence-check delays and idle-event spans overlap other work. They cannot be summed into recoverable time. An immediate `exists` query still incurs a UI snapshot. A failed immediate query adds that cost before the original wait. A theoretical balanced two-worker floor omits contention, runner setup, and serial work.

Publish measured before/after results only after the experiment. Keep the original timeout and fallback behavior. Do not globally lower timeouts, disable synchronization, accelerate production animations, shorten media, or turn native completion into a synthetic command.

### P2: Build-cache and gate-policy changes have weak payoff or different authorization

At this baseline, even eliminating all three build phases would remove only about 2.9% of the recorded wait. Keep Debug and Release inspections, downloader validation, and the runtime guard. An incremental build cache must rebuild changed inputs and verify the requested revision's products; a previous successful result cannot authorize changed code. Reusing a full pass for a documentation-only new commit, moving the full suite away from pre-push, or replacing it with a smoke suite changes the approved gate policy. Those are not implementation details of this optimization.

## Accepted implementation sequence

1. Change only the six already displayed option-row existence assertions in `testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages()` to `row.exists || row.waitForExistence(timeout: 5)`. This affects twelve checks across its two stage variants. Preserve row order, editor navigation, exit, zero-credit assertions, launches, termination, and every timeout. Measure the same method against the baseline and exercise a delayed appearance so the fallback actually runs. Adopt only if its observed benefit justifies the change. Several seconds are plausible; suite-wide savings are unproven.
2. Evaluate two isolated UI selections without changing the installed pre-push default. Keep native integration execution serial and all product guards intact. Use the baseline's 183-identifier union for this unchanged-inventory experiment. Adopt only after complete first-attempt results and an actual resource/time improvement. Do not describe a theoretical roughly halved UI duration as a forecast.
3. Pilot one variation family below XCUI. The finalized [structure analysis](2026-10-09-local-native-testing-structure.md) proposes options-row rendering with real stage-1/stage-11 storage, plus the original six AX frame/order checks and actual speed-route taps in two already-required journeys. Accept this as the first worthwhile migration candidate: it can remove duplicate launches while retaining exact accessibility geometry and interaction owners. Preserve original fixture/state distinctions in the ledger and verify complete journeys after added navigation; the 65.030-second old method is not promised savings. Progress-digit geometry remains a small disproof exercise with its original 0.5-point tolerance and bundled twelve-source selection journey retained. Removing only geometry comparisons will not remove that journey's 27.042-second setup/navigation cost. Subtitle visibility across stages 1, 5, 7, and 9 is a subsequent larger candidate: the current method costs 95.522 seconds and launches four times. Map toggle presence, hint/full-text visibility, translation presence, reveal/hide outcomes, and zero durable credit. Host production content/views with the real store. Keep actual reveal/hide taps and accessibility disclosure for both stage 5 and grouped stage 9, and absence/visible-text accessibility for stages 1 and 7 unless native equivalence is demonstrated. Keep the original matrix while adding its destination coverage, then review whether removing repeated XCUI setup retains each boundary. Measure the replacement; original method durations are upper bounds on affected work, not expected savings.
4. Expand only demonstrated migrations to option summaries, typography, or reward/layout variation families. Preserve offline recovery, failed-save retry, explicit media completion, actual accessibility audits, and durable relaunch journeys. Use clocks only for application-owned scheduling with intermediate and completion assertions. TCA's clock tests demonstrate controlled effects, not AVFoundation or OS completion. [Pinned EffectTests](https://github.com/pointfreeco/swift-composable-architecture/blob/bc2db5ba8ad3a47deba5db32fa340637ba6c9a76/Tests/ComposableArchitectureTests/EffectTests.swift).

## Rejected proposals

- Unsupported “industry-standard full runtime” or promises of a particular completion time from other projects, ideal shard arithmetic, or integration test-body timings.
- Removing variations because another layer asserts a related model value; replacing visible pixels with internal values; counting a resume or elapsed time as completion.
- Reusing app state across unrelated XCUI cases, dropping durable relaunches, replacing real taps/audits with direct methods, or transferring retries from upstream CI.
- Blanket Swift Testing concurrency changes. `.serialized` does not serialize a suite against unrelated suites, and changing XCTest's process parallelism does not establish safe in-process concurrency. [Pinned Swift Testing parallelization documentation](https://github.com/swiftlang/swift-testing/blob/9e542c774f618dfcf601c14e2955afcfb7dd6947/Sources/Testing/Testing.docc/Parallelization.md).
- Automatic four-worker local execution, weak inventory validation, changed-commit pass reuse, or unapproved changes to required checks and release approval.

This is a review and experiment sequence. No runtime improvement, replacement coverage, hardware acceptance, service acceptance, commit, push, or policy change is claimed.

The [coordinating recommendation](2026-10-09-local-native-testing-recommendation.md) matches this decision: bounded twelve-check pilot first, worker and migration experiments afterward, with no runtime target or implemented speedup claimed. Its worker implementation must also carry forward the runner audit's destination locks and guest-drainage requirements.
