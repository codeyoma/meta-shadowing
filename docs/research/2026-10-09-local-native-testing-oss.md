# Open-source practices for faster local native iOS verification

Research date: 2026-10-09. Local source baseline: `9a02defbef3737b30a3794315507570f8e1c3985`.

The useful change is to reduce unnecessary UI automation, not merely optimize compilation. The concurrent local audit reports 78 UI tests taking 44m29s within a 47m13s full run, or 94.2% of the total. It also reports 105 app process launches across those UI tests and 105 native integration cases with approximately 46 seconds of test-body time. These measurements come from the local audit, not from the projects below. This research did not run tests, launch simulators, or measure any upstream runtime. Test-body time is not total test-run time.

Four active repositories were inspected through their current source, with commits pinned below. Wikipedia and Firefox are complete applications. Composable Architecture and Swift Testing are libraries; their test costs cannot establish an achievable application verification time.

## 1. Wikipedia iOS: explicit test layers and reusable products

Pinned source: [`d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c`](https://github.com/wikimedia/wikipedia-ios/commit/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c), committed 2026-10-08.

The pull-request unit workflow runs Wikipedia, WMFComponents, and WMFData as separate matrix schemes. These tests still use `xcodebuild test` with a simulator destination; separating modules does not automatically make them host-side SwiftPM tests. Each scheme retains its own result bundle. [Unit workflow](https://github.com/wikimedia/wikipedia-ios/blob/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c/.github/workflows/run_unit_tests.yml).

Pull requests also run a deliberately selected E2E set. The workflow reads explicit XCTest identifiers, rejects a missing or empty list, and passes each identifier through `-only-testing`. The inspected list contains onboarding, image-gallery sharing, and home-search navigation. This is evidence of an explicit execution contract, not proof that three journeys replace all application behavior. [E2E workflow](https://github.com/wikimedia/wikipedia-ios/blob/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c/.github/workflows/run_e2e_ui_tests.yml), [selection list](https://github.com/wikimedia/wikipedia-ios/blob/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c/WikipediaUITests/E2ESmokeTests.txt).

The normal UI workflow runs daily or on manual dispatch, using one English/light configuration. A separate manually dispatched full-plan workflow builds `.xctestproducts` once, derives a matrix from the test-plan configurations, and uses `test-without-building` for each configuration. It preserves individual result bundles. [Daily UI workflow](https://github.com/wikimedia/wikipedia-ios/blob/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c/.github/workflows/run_ui_tests.yml), [full-plan workflow](https://github.com/wikimedia/wikipedia-ios/blob/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c/.github/workflows/run_full_ui_test_plan.yml).

The simulator preparation action lists available simulators and constructs a destination. Despite its description, it contains no explicit boot/readiness wait, erase, or simulator creation. It therefore does not demonstrate a persistent warm-simulator pool. [Preparation action](https://github.com/wikimedia/wikipedia-ios/blob/d2b887fc8cefc42a4c06a1f9c82c6b1ac056d76c/.github/actions/prepare-simulator/action.yml).

Transfer: explicit test selection, separate module tests, and one build reused by all consumers. Do not transfer the daily/manual scheduling as a substitute for MetaShadowing's required local full verification.

## 2. Firefox iOS: build once, shard UI tests, preserve launch isolation

Pinned source: [`afcb46afdf55892e33638a2b81b3570cffb81a21`](https://github.com/mozilla-mobile/firefox-ios/commit/afcb46afdf55892e33638a2b81b3570cffb81a21), committed 2026-10-08.

The Bitrise pipeline builds first and configures five Firefox UI workers. Build configuration restores the SPM cache, enables the Xcode build cache, builds for testing, runs the unit-test plan without rebuilding, and calculates five smoke UI shards. UI workers retrieve intermediate products and use `test-without-building` with their shard's selection file. PR builds read the SPM cache; only non-PR builds save it. Some test steps allow two repetitions, which is a retry policy rather than a speed improvement. [Bitrise pipeline and workflows](https://github.com/mozilla-mobile/firefox-ios/blob/afcb46afdf55892e33638a2b81b3570cffb81a21/bitrise.yml#L143).

The manually dispatched GitHub UI workflow also separates compilation from test execution. It archives build products for smoke plans, but sets `max-parallel: 1` for its device matrix. Its full-functional job has `if: false`; that job must not be presented as active full coverage. Its older Xcode/iOS versions also make it a weaker operational reference than the current Bitrise configuration. [GitHub UI workflow](https://github.com/mozilla-mobile/firefox-ios/blob/afcb46afdf55892e33638a2b81b3570cffb81a21/.github/workflows/firefox-ios-ui-tests.yml).

The current XCUI base class launches the app in each test's setup and terminates it in teardown. It has a separate profile-preserving relaunch helper for persistence checks. This does not support an assertion that credible apps normally reuse one running app across unrelated XCUI tests. It supports keeping process boundaries when the behavior requires them. [BaseTestCase](https://github.com/mozilla-mobile/firefox-ios/blob/afcb46afdf55892e33638a2b81b3570cffb81a21/firefox-ios/firefox-ios-tests/Tests/XCUITests/BaseTestCase.swift#L206).

Transfer: reuse products and partition all selected tests across isolated workers when resources permit. Five hosted workers are not evidence that five simulators on one local Mac improve elapsed time. Do not copy retries, cloud signing, bootstrap dependencies, or reduced test-plan coverage.

## 3. Composable Architecture: exhaustive logic tests and controlled time

Pinned source: [`bc2db5ba8ad3a47deba5db32fa340637ba6c9a76`](https://github.com/pointfreeco/swift-composable-architecture/commit/bc2db5ba8ad3a47deba5db32fa340637ba6c9a76), committed 2026-10-06. This is a library with example applications.

CI separates iOS/macOS library test/build jobs from example builds. It caches DerivedData using platform, Xcode, command, and source/test hashes, with prefix fallback; it also restores source modification times. This establishes a deliberate incremental-build practice, not correctness of arbitrary cross-commit binary reuse. The examples job builds several schemes; its existence does not prove those examples receive complete UI acceptance. [CI workflow](https://github.com/pointfreeco/swift-composable-architecture/blob/bc2db5ba8ad3a47deba5db32fa340637ba6c9a76/.github/workflows/ci.yml).

Actual effect tests inject `TestClock`, start effects, advance simulated time, and assert emitted values at each step. The testing guide explains replacing uncontrolled real-time sleeps with injected clocks and discusses framework/package tests avoiding the application entry point used by app-hosted tests. Its state/effect examples retain intermediate assertions and effect completion checks. These practices can transfer without adopting TCA or changing product timing. [EffectTests](https://github.com/pointfreeco/swift-composable-architecture/blob/bc2db5ba8ad3a47deba5db32fa340637ba6c9a76/Tests/ComposableArchitectureTests/EffectTests.swift), [testing guide](https://github.com/pointfreeco/swift-composable-architecture/blob/bc2db5ba8ad3a47deba5db32fa340637ba6c9a76/Sources/ComposableArchitecture/Documentation.docc/Articles/TestingTCA.md).

Transfer: test rules, command outcomes, preferences, cancellation, and durable state at their public boundaries. Use controlled time only for application-owned scheduling. A simulated clock cannot establish real AVFoundation completion, microphone behavior, OS lifecycle transitions, or audio render behavior.

## 4. Swift Testing: host execution and narrowly scoped serialization

Pinned source: [`9e542c774f618dfcf601c14e2955afcfb7dd6947`](https://github.com/swiftlang/swift-testing/commit/9e542c774f618dfcf601c14e2955afcfb7dd6947), committed 2026-10-08. This is a testing library, not an application.

Its PR workflow calls Swift's reusable package workflow at `0.0.15`, resolved during this research to commit `9a10bfdc569159a3463f1273fbd7ed5f97fbe598`. The reusable workflow's macOS default executes `xcrun swift test`. Its iOS job builds the library and test targets for an iOS device SDK; that job is explicitly build-only. Do not describe it as simulator runtime verification. [Swift Testing PR workflow](https://github.com/swiftlang/swift-testing/blob/9e542c774f618dfcf601c14e2955afcfb7dd6947/.github/workflows/pull_request.yml), [pinned reusable workflow](https://github.com/swiftlang/github-workflows/blob/9a10bfdc569159a3463f1273fbd7ed5f97fbe598/.github/workflows/swift_package_test.yml#L142).

Swift Testing documents parallel task execution within a process. `.serialized` serializes a suite and its descendants, but does not serialize that suite against unrelated suites. Applying it to an ordinary nonparameterized function has no effect. This distinction matters for tests that share audio sessions, lifecycle notifications, window state, or other process-wide services. [Parallelization documentation](https://github.com/swiftlang/swift-testing/blob/9e542c774f618dfcf601c14e2955afcfb7dd6947/Sources/Testing/Testing.docc/Parallelization.md).

Transfer: keep portable logic in existing host-side packages and audit global resource ownership before enabling parallel execution. Blanket removal of serialization is not an evidence-backed improvement.

## Candidates for MetaShadowing, preserving assertions

These are research recommendations, not implemented or measured changes.

1. Create an assertion-level migration map for the 78 UI tests. Move rule/preference/state combinations into existing package tests or native rendering integration tests when those layers can observe the same public outcomes. Keep visible navigation, interaction wiring, accessibility audits, real media, background/foreground behavior, and process relaunch in XCUI. Every moved assertion needs an identified destination and equivalent positive/negative expectations. Merely reducing the count of UI methods does not prove preserved coverage.
2. Reduce launch work within a coherent journey when a fresh process is only fixture setup. Prefer a small number of real launch/interaction journeys plus fast isolated tests for combinatorial state. Keep every terminate/relaunch boundary that verifies durable SQLite state, no implicit playback, recovery, or no extra learning credit. The inspected Firefox source provides no evidence for sharing one app instance across unrelated tests.
3. Replace wall-clock delays only for injected application scheduling, retaining intermediate events and settled-state assertions. Keep real native media/lifecycle checks. Replacing native completion with a synthetic button or counting a resumed operation as completed would weaken acceptance.
4. Preserve the existing one-build/many-executions pattern. At the local baseline, `test-native-full.sh` already uses `build-for-testing`, `.xctestproducts`, and `test-without-building`; it also reuses the explicitly supplied dedicated simulator after a readiness check. These are existing strengths, not new opportunities. [Local full runner](../../native-ios/scripts/test-native-full.sh).
5. Consider cache/build isolation only after profiling remaining setup. The current pre-push verifier archives the exact pushed commit and caches only an exact successful identity. Keep that authority. Any future incremental build cache must still rebuild/check requested inputs and preserve Debug/Release/downloader guards, inventory equality, finalized result validation, zero failures, and zero skips. Do not turn an old successful result into authority for a changed commit. [Local pre-push verifier](../../native-ios/scripts/native-pre-push.rb), [result validator](../../native-ios/scripts/validate-native-test-results.rb).
6. If UI sharding is evaluated, require the union of shard inventories to equal the complete inventory with no duplicates or omissions. Retain dedicated simulators and local resource limits. Neither Wikipedia's matrix nor Firefox's five hosted workers establishes the safe local concurrency level.

Build-only changes cannot produce a drastic reduction when UI work accounts for 94.2% of the measured run. The plausible large improvement is fewer expensive UI executions with equivalent assertions retained at faster boundaries. No target runtime is established by this survey; the proposed migration must be reviewed and measured on the local full verifier.
