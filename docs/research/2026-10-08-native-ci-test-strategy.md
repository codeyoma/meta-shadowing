# Native iOS CI test strategy research

Research date: 2026-10-08. Owner amendment: 2026-10-09. Scope: the standalone Swift app and its existing GitHub Actions checks. This note records primary-source guidance and the selected test-frequency policy. It does not change application behavior, test assertions, branch protection, or release authority.

## Recommendation

Owner clarification, 2026-10-09: retain every host Swift package test, tooling contracts, and one generic unsigned Debug app build/product inspection on ordinary remote runs. Move every simulator-dependent check, including the complete `NativeMediaIntegrationTests` target, to the blocking local `pre-push` hook or explicit manual full CI. Move Release/product/runtime inspection and fictional downloader compilation to that full boundary as well. Automatic `light` CI must not boot, install or launch a simulator, build/transfer test products, or execute native UI/integration cases. Preserve required check names, a manual full-CI option and human release approval. No path-based selection or scheduled workflow is added.

The earlier eight-UI-test proposal is superseded. In run [37809040927](https://github.com/codeyoma/meta-shadowing/actions/runs/37809040927), those simulator jobs still took about thirteen minutes each. All 375 host package cases took about 10.15 seconds of test execution, while the six build/test steps took about 188 seconds. Keeping that complete logic gate is simpler and preserves more product coverage than selecting an arbitrary subset of fast tests. A Debug compile keeps the existing required build check meaningful without simulator execution. New hosted timing still requires measurement.

The local hook tests the actual pushed commit in an isolated archive, never dirty working files. Successful exact-commit/toolchain/simulator results can be reused, but incomplete or failed runs block the push. Hooks can be absent or bypassed and do not validate GitHub's merge candidate. Keep fast remote checks and inspect full-regression evidence explicitly before release. See [the implemented policy and installation contract](../native-ci.md#fast-remote-checks-and-local-full-regression) and [Git's pre-push hook contract](https://git-scm.com/docs/githooks#_pre_push). Moving tests locally shifts waiting time; it does not eliminate the full test workload.

This is a change in test frequency, not evidence that excluded UI tests are redundant. Full regression must remain independently executable and report its actual executed inventory. Reduced PR results must identify themselves as reduced results.

Apple explicitly recommends separate PR and full test plans: unit tests plus a key subset of UI tests on one platform for PRs, with the full set running separately in the background. Apple's current testing documentation also recommends a pyramid of many isolated unit tests, fewer integration tests, and UI tests for common use cases. These sources support separating feedback tiers; moving all simulator work to the local/manual boundary is the owner's project-specific choice, not an Apple requirement. [Apple WWDC22: Author fast and reliable tests for Xcode Cloud](https://developer.apple.com/videos/play/wwdc2022/110361/), [Apple: Testing](https://developer.apple.com/documentation/xcode/testing).

## Current project evidence

The existing full workflow builds test products once with `build-for-testing`, shares a portable `.xctestproducts` archive, and executes four serial runner shards with `test-without-building`. That optimization remains available for manual full runs; it does not address the ordinary-run UI execution cost. The current scheme builds `NativeFoundationUITests` and `NativeMediaIntegrationTests`; the latter contains both Swift Testing and XCTest tests, including actual UIKit/SwiftUI rendering, audio/video adapters, lifecycle ownership, local recovery, and dictionary presentation. Those checks remain full-regression responsibilities. [Workflow](../../.github/workflows/ci.yml), [Project specification](../../native-ios/project.yml).

The latest documented complete run passed 183 native cases and 375 package cases. It took 34m 26s, compared with 33m 02s before rendered-view restructuring. The new rendering checks occupied about seven seconds of the hosted log timeline, but another shard still spent 19m 48s in its UI cases. These are recorded historical measurements, not a new hosted benchmark or a guarantee of future duration. UI method counts differ from executed case counts because parameterized tests can produce multiple cases. [Native CI evidence](../native-ci.md#ci-timing-baseline).

The migration contract requires real public behavior and durable checkpoints. Resume is not completion. The deployment minimum remains iOS 26.0; current verification uses an isolated iOS 27 Simulator. CI evidence does not replace pending real-device or Apple-service acceptance. [Repository instructions](../../AGENTS.md), [Native guide](../../native-ios/README.md).

## Primary-source findings

### Test the logic broadly and the full UI selectively

Apple describes unit tests as fast and focused, integration tests as checking connected subsystems, and a small number of end-to-end tests as checking that the pieces work together with the operating system. This supports testing credit rules, persistence, cancellation, and recovery below UI automation while preserving real UI journeys for composition and interaction. [Apple WWDC18: Testing Tips & Tricks](https://developer.apple.com/videos/play/wwdc2018/417/).

Apple's current guidance distinguishes three feedback stages: relevant unit tests while editing, tests for the affected target before review/integration, and complete suites with multiple configurations on a schedule. Scheduled coverage complements PR coverage; it does not make excluded cases verified for the PR revision. [Apple: Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results).

**Project inference:** all six existing package suites are valuable per-PR logic checks. Host-platform package tests cannot verify iOS-only AVFoundation, UIKit, lifecycle, or actual SwiftUI composition; the complete native integration target must therefore remain in local/manual full regression. The revised boundary removes all ordinary-run simulator startup and automation, without reducing domain or persistence test selection.

### Use each testing framework for its supported role

Apple recommends Swift Testing for new unit tests and XCTest with XCUIAutomation for UI tests. Both frameworks may occur in one target, but their APIs must not be mixed within an individual test. A wholesale conversion of UI tests to Swift Testing is not the supported optimization. [Apple: XCTest](https://developer.apple.com/documentation/xctest/).

Swift Testing runs tests in parallel by default. A `.serialized` suite runs its own children serially but does not prevent unrelated suites from running concurrently. Serialization is not a global lock for shared audio sessions, windows, notifications, or other process-wide state. [Swift: Organizing test functions with suite types](https://docs.swift.org/latest/documentation/testing/organizingtests/), [Swift: ParallelizationTrait](https://docs.swift.org/latest/documentation/testing/parallelizationtrait/).

**Project inference:** retain current isolation and serial Xcode execution while changing selection frequency. The repository already records a same-runner concurrency experiment that became slower and failed on hosted infrastructure. Package parallelism and simulator-worker parallelism are different mechanisms. Do not infer that enabling more Xcode UI workers will improve the current runner.

### Await actual work and establish state explicitly

Swift Testing integrates with `async`/`await`; confirmations count expected events during a closure. XCTest supports `async` tests and expectations for callbacks or delegates. These tools support waiting for observable completion rather than inserting a fixed delay. [Swift: Testing asynchronous code](https://docs.swift.org/latest/documentation/testing/testing-asynchronous-code/), [Apple: Asynchronous Tests and Expectations](https://developer.apple.com/documentation/xctest/asynchronous-tests-and-expectations).

Apple advises creating required state in setup, avoiding assumptions about previously initialized simulators, and mocking external services where possible for speed and deterministic behavior. This guidance is applicable to the project's isolated profiles and controlled transport fixtures. It does not mean skipping the real SQLite or media boundaries. [Apple WWDC22: Author fast and reliable tests for Xcode Cloud](https://developer.apple.com/videos/play/wwdc2022/110361/).

**Project inference:** a faster CI change should preserve readiness checks, confirmation boundaries, exact credit assertions, relaunch persistence checks, and cancellation ownership. Do not make tests fast by fabricating native completion, shortening the product's media, increasing timeouts, or retrying failed assertions until green. Apple discusses retries for unreliable external services; this project deliberately uses controlled fixtures and a no-retry policy.

### Test plans describe selection, not coverage equivalence

Xcode supports multiple test plans for a scheme, explicit target/suite/function selections, and configurations for runtime settings. It executes selected tests once per configuration. An excluded test provides no execution feedback even though a build error can still fail the action. Therefore compiling the complete test target is not evidence that every case ran. [Apple: Improving code assessment by organizing tests into test plans](https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback).

Apple documents `build-for-testing` and `test-without-building` as separate CI actions, with `-only-testing` and `-skip-testing` selectors. Portable `.xctestproducts` support exists specifically to ease transporting built tests between systems. [Apple TN2339](https://developer.apple.com/library/archive/technotes/tn2339/_index.html), [Apple: Xcode 13.3 Release Notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-13_3-release-notes).

**Project inference:** preserve the shared artifact and full test compilation for explicit manual full runs only. Named Xcode test plans are valid, but introducing them does not inherently reduce compilation or guarantee correct selection. Keep full mode automatically inclusive of future classes and targets, and compare executed identifiers with compiled discovery. Ordinary light mode must not silently execute any of that simulator pipeline.

### Preserve required-check behavior across conditional execution

GitHub warns that skipping an entire required workflow through path filters leaves its checks pending, while a conditionally skipped job can report success. A failed prerequisite can also skip a dependent job; GitHub recommends `always()` with `needs` for required dependent checks. Required checks must apply to the latest relevant commit. [GitHub: Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks), [GitHub: Status checks](https://docs.github.com/en/pull-requests/reference/status-checks).

**Project inference:** retain `ci-branch-policy`, `ci-quality`, `ci-native-tests`, and `ci-ios-build` without remote ruleset changes. Keep the always-running native aggregate gate. It should require exact success from every job selected by the run's explicit PR/full mode; cancellation, missing results, unexpected skipped jobs, or an unknown mode must fail. A deliberate full-only job omission on a fast PR is different from silently accepting a skipped required fast job. Avoid workflow-level path filters in this change.

## Approved simulator-free remote split

| Evidence | Automatic remote PR/push | Local native full / manual full CI |
| --- | --- | --- |
| Branch policy and workflow contracts | Complete | Remain remote; manual full includes them |
| Six Swift package suites | Complete, unfiltered, nonempty successful summaries | Remain remote; manual full includes them |
| `NativeMediaIntegrationTests` | Not executed | Complete |
| UI automation | Not executed | Complete `NativeFoundationUITests`, including all future methods |
| Debug app build/inspection | One generic unsigned build, no simulator boot | Inspect existing full-test app; manual full includes Debug inspection |
| Release/product/runtime and downloader checks | Not executed | Complete |
| Platform/runtime | macOS host package execution and generic iOS compilation | Dedicated iOS 27 simulator; iOS 26.0 deployment minimum unchanged |

## Earlier eight-journey proposal (superseded)

The following methods were selected for the previous remote profile. They remain meaningful full-regression coverage, but none runs in automatic light CI after the owner's clarification. The list is retained as historical selection rationale, not current PR execution evidence.

| Existing UI method | Full-regression evidence |
| --- | --- |
| `PlayerUITests/testRealAudioConfirmationAndPausedMenu` | Real bundled playback completion, one explicit confirmation, exact XP, real header interactions and paused options exit |
| `PlayerUITests/testInstalledLessonReopensWithoutServiceAccessOrExtraCredit` | Production UI terminate/relaunch, exactly one restored XP and cycle, sync disabled in Settings, Books/Stages navigation, paused options exit and no stage completion from one cycle |
| `PlayerUITests/testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay` | Failed durable save, explicit retry, exactly one credit, paused playback and relaunch checkpoint |
| `PlayerUITests/testAllSentencesSelectsPausedWithoutCredit` | Real source-list selection returns to paused learning without earning credit |
| `NativeFoundationUITests/testRetryRemainsReachableAtLargestText` | Actual launch overlay removal, recovery hitability and foreground preservation at accessibility text size |
| `ReferenceToolsUITests/testSingleSentenceOpensDetailAndBackDismissesToPausedLearning` | Native reference entry/navigation returns to paused learning without extra credit |
| `VoiceOverSemanticsUITests/testVoiceOverLabelsValuesAndOrder` | Basic UI automation semantics and reading-order contract across library, stages, player and rate editor |
| `ProductAccessibilityUITests/testLongHintTextDoesNotLeakAndControlsStayReachable` | Largest-text long fixture, hidden hint-text protection, reachable real controls, and actual `sufficientElementDescription`/`trait` accessibility audits |

Source files: [Player UI](../../native-ios/Tests/AppUITests/PlayerUITests.swift), [Foundation UI](../../native-ios/Tests/AppUITests/NativeFoundationUITests.swift), [Reference UI](../../native-ios/Tests/AppUITests/ReferenceToolsUITests.swift), [VoiceOver UI](../../native-ios/Tests/AppUITests/VoiceOverSemanticsUITests.swift), [Product accessibility UI](../../native-ios/Tests/AppUITests/ProductAccessibilityUITests.swift).

Full regression retains these eight journeys, controlled download/offline journeys, detailed video/reward/options interactions, developer-lab journeys, free-service controls, settings-editor persistence variants, graph scrolling, and complete Dynamic Type/theme accessibility audit matrices. Automated audits still do not prove VoiceOver spoken output or focus behavior.

Run full native regression before push through the installed local hook, or request full remote CI manually. For changes to app composition, service wiring, playback completion, persistence, accessibility, test selection, or CI infrastructure, inspect evidence for the intended integration/release revision. This recommendation adds no automatic path rules, new triggers, or remote ruleset. Every new behavior still needs meaningful logic or integration regression coverage; ordinary host tests are not UI acceptance.

## Risks and verification boundaries

- The reduced remote gate can miss interactions covered only by full regression, including controlled external download failures, editor-persistence UI variations, and the full accessibility matrices. Local hooks are not trusted server enforcement and a local commit pass is not merge-candidate evidence. Manual full CI and human release review remain the backstop when such evidence is required.
- The ordinary Debug build compiles the app, not the UI test suite. Report the selected mode and actual evidence; never label a host package run as a complete 183-case native pass.
- The local hook now also owns Release and downloader build checks. These must fail the same push gate, and a result from the earlier native-only runner contract must not satisfy the stronger gate.
- Ordinary light mode removes shared test builds, artifact transfer, cold simulator installation/launch, and UI execution entirely. Host package/app compilation and runner queue latency remain. No fixed duration or first-pass reliability improvement is established before a fresh hosted run.
- Keep nonempty finalized results, zero failed/skipped executed cases, and exact selected-method coverage. Test-selector typos must not produce a green zero-test result. Full mode must still verify the complete inventory and disjoint shard ownership.
- Controlled service and offline fixtures do not prove real CloudKit convergence, Apple-hosted interruption, or physical-device microphone behavior. Preserve those acceptance boundaries.

Validate both modes: ordinary light PR/push with all six host package suites and exactly one Debug app build, with no reachable simulator work; full regression with the complete compiled native inventory and Release/downloader/product checks. Check failure, cancellation, missing artifact, unknown mode, unknown selector, and missing-result propagation through the stable required aggregate. Then measure a fresh hosted light run. The earlier 113-case fast attempt took 14m43s but failed an existing retry hit-test case; the unchanged failed-job rerun recovered, with 29m02s end-to-end elapsed. Neither establishes a clean first-pass speedup or fixes that intermittency. Local timing alone is insufficient.
