# Apple and Swift guidance for faster local native testing

Date: 2026-10-09. Repository baseline: `9a02def`. Scope: research and source inspection only. No simulator activity, native test execution, workflow changes, hook changes, or application changes were performed for this note. The approximately 47-minute full local run is the reported problem, not a measurement reproduced by this research.

## Findings from primary sources

### 1. Put most behavioral combinations below UI automation

Apple recommends a test pyramid: many fast, isolated unit tests, fewer integration tests, and UI tests for common user workflows. This is an allocation principle, not a numerical quota or permission to remove assertions. Swift Testing supports unit tests; XCTest and XCUIAutomation remain the tools for UI automation. [Apple: Testing](https://developer.apple.com/documentation/xcode/testing)

Apple's practical example separates request construction and parsing into independent functions, tests system integration at the next layer, and uses end-to-end tests to check wiring. It also recommends direct notification/expectation mechanisms instead of predicate polling in unit tests, injected scheduling for delayed actions, and avoiding unnecessary setup when an application launches as a unit-test host. The qualification is essential: omitted launch work must be nonessential to that unit test. [WWDC18: Testing Tips & Tricks](https://developer.apple.com/videos/play/wwdc2018/417/)

Project inference: logical parameter combinations for XP, stage rules, failed-save handling, and preference persistence belong primarily in the existing domain, persistence, and foundation packages. UI tests still need to establish real controls, rendering, lifecycle wiring, and durable relaunch behavior. An existing UI test cannot be silently removed because a package test looks similar; its unique evidence must first be mapped and preserved.

### 2. Separate fast feedback from comprehensive acceptance

Apple describes a small pull-request test plan and a comprehensive background plan. The smaller plan can contain unit tests plus important UI workflows. Apple also recommends setup that establishes each test's state, read-only shared fixtures where suitable, and mock external services for deterministic reliability and speed. Parallel execution requires independent tests and sufficient cores. Test repetitions diagnose reliability; unnecessary repetitions consume time. Apple's session also presents skips and expected failures, but this project's complete gate explicitly rejects skips and failures, so those examples do not justify weakening the gate. [WWDC22: Author fast and reliable tests for Xcode Cloud](https://developer.apple.com/videos/play/wwdc2022/110361/)

Project inference: the existing remote `light` profile already follows part of this strategy. It does not reduce the full pre-push requirement, because every new commit still requires comprehensive local evidence. A separate developer feedback command could improve iteration without changing the full gate. Moving comprehensive execution away from pre-push would be a policy change, not a free technical optimization, and is outside this research's implementation scope.

### 3. Treat XCTest parallelism as a measured resource experiment

Apple's distributed XCTest runner allocates test classes across destinations, one class at a time on each destination. Allocation is nondeterministic. Apple recommends identical devices and OS versions when distributing platform-sensitive tests. Distributed testing divides work; destination testing runs the entire suite on each destination. Test execution allowances address hangs and provide diagnostics; they do not optimize normally passing tests. Apple's example speedup is evidence for Apple's suite, not a forecast for this repository. [WWDC20: Get your test results faster](https://developer.apple.com/videos/play/wwdc2020/10221/)

Project inference: consider an explicit two-worker experiment only after confirming available local CPU, memory, simulator isolation, and test-state ownership. Keep iOS 27 destinations identical. Use one validated build of test products; compare the same complete compiled inventory and executed identifier union, with zero failure and zero skip. More simulator processes can increase contention and expose shared audio-session, UI appearance, or lifecycle assumptions. Four existing manual-CI selections are not evidence that four concurrent simulators on one Mac will be efficient or reliable. Balance shards using observed durations, not test counts.

### 4. Swift Testing has a different concurrency model

Swift Testing runs tests in parallel by default using task groups in a process, with concurrency controlled by the Swift runtime. The `.serialized` trait orders tests within the relevant suite or parameterized test; unrelated suites may still run concurrently. A serialized suite therefore does not provide a process-wide lock over global resources. [Swift Testing: Running tests serially or in parallel](https://developer.apple.com/documentation/testing/parallelization)

Apple explains that XCTest parallelism uses multiple processes, each running one test at a time, whereas Swift Testing runs test functions concurrently in-process. Tests can use async/await and continuations for completion callbacks. The recommendation is to refactor tests for independence where possible, retaining serialization where needed. [WWDC24: Go further with Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10195/)

Project inference: do not interpret `-parallel-testing-enabled NO` as disabling every form of concurrency inside Swift Testing, and do not migrate UI automation to Swift Testing. Host package suites already use Swift Testing. Migrating integration tests solely for a claimed speed improvement has no evidence here; resource ownership and actual platform behavior matter more than framework branding.

### 5. Preserve condition waits and distinguish diagnostic media from assertions

Apple demonstrates `waitForExistence` and `wait(for:toEqual:)` paired with assertions. Test plans control repetitions, timeouts, parallelization, configurations, and recording. Videos and screenshots are normally retained for failed runs; retaining all is an explicit alternative. The session describes UI automation as complementary to unit tests because it validates user workflows and platform integration. [WWDC25: Record, replay, and review: UI automation with Xcode](https://developer.apple.com/videos/play/wwdc2025/344/)

Project inference: a timeout argument is an upper bound, not proof that a passing condition wait consumes that whole interval. Lowering all 5/10/20-second limits does not establish a speed improvement and may create failures. Existing pixel assertions in `BookshelfUITests` and `ProductUITests` consume screenshots as test inputs; these are not disposable diagnostic attachments. Accessibility audit findings and visual review evidence also have distinct contracts. Review recording/attachment cost only after measuring it, while preserving assertion inputs and required acceptance evidence.

### 6. Build once, execute validated products

Apple's Xcode Cloud test action first creates products with `xcodebuild build-for-testing`, then executes them with `xcodebuild test-without-building`. The source is not available during the second phase. Products and results are retained as artifacts. This establishes a first-party precedent for independently building and executing a known test artifact. [Apple: Configuring your Xcode Cloud workflow's actions](https://developer.apple.com/documentation/xcode/configuring-your-xcode-cloud-workflow-s-actions)

Project observation: `test-native-full.sh` already builds Debug test products once with `build-for-testing -testProductsPath`, enumerates them, and runs them with `test-without-building -testProductsPath`. It builds and inspects Release separately, builds the fictional downloader, and exercises the runtime inspection guard. Recommending these split commands as a new optimization would duplicate existing work.

## Repository evidence and constraints

- [Native README](../../native-ios/README.md) describes six unfiltered host suites, a 183-case complete native simulator suite including 105 integration cases, full local pre-push coverage, exact-commit reuse, and iOS 27 verification with an iOS 26.0 deployment minimum. These counts are documented inventory; this research did not re-enumerate compiled products.
- [Full local runner](../../native-ios/scripts/test-native-full.sh) executes the native suite serially and already sets `-collect-test-diagnostics never`. It uses fresh private output paths for the full run. Build caching therefore needs separate investigation; changing to `test-without-building` alone cannot remove current build cost.
- [Project specification](../../native-ios/project.yml) has an application-dependent integration target and a UI automation target. Host-package success cannot establish AVFoundation, UIKit, SwiftUI, audio-session, or actual lifecycle behavior.
- [Player UI tests](../../native-ios/Tests/AppUITests/PlayerUITests.swift) include real playback completion, explicit confirmation, XP assertions, option interactions, failed-save retry, and relaunch checkpoints. These contracts must survive any fixture/setup optimization.
- [VoiceOver tests](../../native-ios/Tests/AppUITests/VoiceOverSemanticsUITests.swift) run actual accessibility audits across light, dark, and largest-text configurations. These are deliberate distinct environments, not automatically redundant repetitions.
- [Integration fixtures](../../native-ios/Tests/MediaIntegrationTests/MediaFixtureFactory.swift) and [media package tests](../../native-ios/Packages/LearningMedia/Tests/LearningMediaTests/SilentRevealClockTests.swift) contain polling or sleeps. Some long sleeps model cancellable pending work; their literals cannot be summed as actual suite duration. Distinguish deliberate timing/real native playback from replaceable scheduling overhead.

## Proposed priorities

The coordinating investigation reported an existing result breakdown of 47m13s total, 44m29s for 78 UI tests (94.2% of total), and approximately 46 seconds of test-body time for 105 integration cases. This note's author did not independently parse that result. Subject to that evidence, UI execution should be the primary optimization target; a new test plan or build/execution setting is not itself a reduction in UI work. Apple supports concentrating pure logic in lower layers, but does not establish that all rendering, layout, accessibility, or lifecycle acceptance can be replaced by host tests.

1. Establish where the reported 47 minutes goes using existing private logs and `.xcresult`: build phases, native case durations, launch/relaunch, media completion, UI traversal, audit execution, and runner/result overhead. Rank by measured accumulated time. Do not infer cost by adding timeout literals.
2. Preserve the existing build-once design. Investigate reusable compilation separately from reusable PASS results. Any candidate cache must keep exact pushed bytes, public assets, toolchain, build settings, and product validation authoritative; a prior-commit PASS must not satisfy a new commit.
3. Trial limited isolated XCTest parallelism only when measured CPU/memory capacity and ownership support it. Require complete inventory equivalence and unchanged real-media/lifecycle assertions before considering adoption. Keep a serial fallback for diagnosing contention rather than accepting flaky reruns as success.
4. Audit expensive repeated setup. Reuse immutable generated fixture bytes where safe, retain per-test mutable SQLite/profile isolation, and use controlled completion signals for purely logical setup delays. Do not fast-forward the real media completion being accepted, skip launch behavior under test, or replace durable relaunch checks with in-memory state.
5. Apply the pyramid to future coverage growth. Preserve full pre-push acceptance while adding a documented fast developer loop. If relocating the full gate becomes desirable, treat it as a separately reviewed owner decision with explicit evidence and failure-handling requirements.

No duration target, percentage improvement, or drastic speedup is proven by these sources or by this research. Current source inspection supports candidate experiments, not a verified performance result. No skipped test, weaker assertion, simulated playback-ended button, changed required check, Android target, physical-device replacement, or live Apple service access is proposed.
