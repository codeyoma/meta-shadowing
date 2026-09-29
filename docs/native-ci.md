# Swift pull-request checks

`.github/workflows/ci.yml` validates the standalone app in `native-ios/` on PRs
into `dev`/`main`, pushes to those branches and manual dispatch. PR checkout uses
GitHub's merge candidate, not only the head. The owner approved replacing the
Expo reference CI lane; the reference source remains available for migration.

## Required checks

| Required check | Evidence |
| --- | --- |
| `ci-branch-policy` | Allowed internal feature/release routes and policy regression tests |
| `ci-quality` | Swift Testing suites in `LearningDomain`, `LearningPersistence`, `AppFoundation`, `LearningMedia` and `LearningReference` |
| `ci-native-tests` | Debug XCUITest plus actual iOS audio/video, lifecycle, artwork decoding and Core Haptics construction tests |
| `ci-ios-build` | Clean-checkout configuration test, standalone Debug/Release builds and native-product inspection |

The generic branch-policy script still uses Node 24 without npm installation.
It is repository governance, not an Expo application check. Hosted checks no
longer install npm dependencies, run TypeScript/JavaScript application tests,
export Expo bundles, run Expo prebuild/CocoaPods or test reference native modules.

## Toolchain and isolation

Swift jobs use the standard arm64 `xcode-27` GitHub-hosted runner (currently a
public preview), with `/Applications/Xcode_27.0.app/Contents/Developer` selected
explicitly. UI tests require the iOS 27.0 runtime and fail if it is unavailable;
they never fall back to an older simulator. The app still targets iOS 26.0+.
See the [official runner inventory](https://github.com/actions/runner-images/blob/main/images/macos/xcode-27-arm64-Readme.md).
The narrow actionlint label extension recognizes this official preview label;
it does not configure a self-hosted runner or suppress other workflow checks.

XcodeGen generates `native-ios/project-ci.yml`, which includes the normal app
specification and overrides only its config-file references. The checked-in CI
config contains a fictional simulator identity and disables signing. It does
not include, create or overwrite private `Local.xcconfig`. A regression test
generates a disposable copy without that local file and verifies the resolved
identity, compiler, deployment and signing settings for both configurations.
It also verifies that both complete test targets occur exactly once, with no
selected or skipped tests in the scheme and serial execution for both targets.

CI partitions the complete scheme into two complementary jobs:

| Shard | Selection |
| --- | --- |
| `player` | `-only-testing:NativeFoundationUITests/PlayerUITests` |
| `remaining` | `-skip-testing:NativeFoundationUITests/PlayerUITests` |

Both selections derive from the same class identifier in the workflow. The first
runs the longest UI class; the second runs every other UI test and all media
integration tests. New tests automatically enter one of these complementary sets.
Each job uses its own standard hosted runner, builds its own test products and
passes `-parallel-testing-enabled NO`, retaining one simulator and the existing
Swift Testing suite isolation. This repeats setup to avoid simulator contention.
There are no paid larger runners or external providers.

The matrix uses `fail-fast: false` so a failure in one shard does not suppress the
other shard's results. Each result summary must be nonempty, fully passing and
contain zero failed or skipped tests. The required `ci-native-tests` job runs
with `always()` and accepts only an aggregate shard result of `success`; failures,
cancellations and skipped shards cannot make the required check green. Release
approval still depends on this exact required check name.

UI tests run in Debug because the retry test uses a Debug-only failure injection.
Before starting XCUITest, a separate five-minute preparation step waits for
`simctl bootstatus -b` to report that the required iOS 27 Simulator has finished
booting. A readiness failure fails the job; it does not skip or retry failed tests.
The job then builds test products and performs a single app install/launch preflight
in a separate UUID-scoped product profile before `test-without-building`. This checks
the app-launch service as well as simulator boot, and fails if launch cannot succeed.
Each XCTest still starts a clean app process: [XCUIApplication.launch](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/launch())
terminates any running preflight instance. No test results are manufactured by the preflight.
The synthetic confirmation test waits for the button to become enabled and
hittable after the asynchronous save, rather than treating unchanged XP as readiness.
The load-retry test uses an isolated product profile and verifies that foregrounding
does not consume its explicit retry action. Test assertions include failure messages
so the result summary distinguishes loading, launch-gate and retry failures.
The retry checks explicitly wait for the real launch overlay to disappear, cover
the largest Dynamic Type setting, and include button/window geometry on a hit-test failure.
Verbose simulator diagnostic collection is disabled because it can stall for ten
minutes after a failure. XCTest assertions, result bundles, failure summaries and
nonzero test exit codes remain enabled; no failed test is skipped or retried by CI.
Dictionary ownership tests use a separate 30-second, condition-based UIKit deadline,
not the five-second media-fixture deadline. On consecutive cold hosted runs, the first
dictionary test exceeded the media deadline while the next dictionary test passed.
The summary alone cannot distinguish slow presentation from a stuck drawer.
The fixture also exercises a deliberately
delayed presentation beyond five seconds. It still requires exactly one completion,
no attached drawer, and no premature cancellation completion. Timeout failures name
dictionary cleanup, include captured assertion values, and stop the test. Media deadlines are unchanged.
CI reports every assertion message for failed test cases, not only the first message
from Xcode's summary. Device metadata and source locations remain excluded.
Each native shard has a 40-minute budget, including cold simulator setup and test-product
compilation; the test step itself remains bounded at 30 minutes. A previous 30-minute
job limit cancelled the expanded suite before Xcode could finalize its result bundle.
Only test-case lifecycle lines and the final test verdict are streamed from Xcode's
verbose output; shell `pipefail` preserves test failures through that filter. The result
summary fails explicitly when no finalized bundle is available.
Parallel test output omits simulator clone names. The result report also lists the
ten slowest test cases by duration, without device metadata or source locations.
Both Debug and Release products are inspected for JavaScript resources, excluded
runtime dependencies/symbols, the iOS 26.0 minimum and unexpected entitlements.
The guard also checks unchanged launch artwork, microphone/background-audio
declarations, unchanged bundled sample manifest/audio, and absence of Debug
storage/media/product fixture symbols in Release.
These checks require XcodeGen, `jq` and `rg`; missing build tools are installed
with Homebrew. Toolchain versions are printed for reproducibility.

Actions are SHA-pinned, Swift CI tokens are read-only, and checkout credentials
are not persisted. All jobs have timeouts and no path-based skipping. No signing
credentials, Apple accounts, private lessons or hosted data are needed. UI result
summaries expose test failures without exporting complete simulator logs or
result bundles. Local reproduction commands are in [the native guide](../native-ios/README.md).

## CI timing baseline

The two successful hosted runs immediately before this change on 2026-09-29
spent 27m 26s and 28m 55s in `ci-native-tests`. The latest run broke down as follows:

| Step | Duration |
| --- | --- |
| Simulator readiness | 1m 03s |
| Build test products | 5m 36s |
| Install and launch preflight | 14s |
| Execute all tests | 21m 27s |

All 73 tests passed: 39 UI tests and 34 integration tests. UI test durations summed
to 20m 25s, with `PlayerUITests` accounting for 10m 23s. This makes UI execution the
first optimization target; checkout took two seconds and the other required jobs
finished within 3m 20s. The split therefore balances the long player class against
the remaining suite, while accounting for repeated setup on separate runners.

This applies the measurement and setup-cost principles from
[Linear's CI optimization report](https://linear.app/now/ci-bottleneck-reworked).
Build caching and further shards need separate measurements; their restore,
save and repeated setup costs are not assumed to be free.

### Rejected same-runner experiment

On 2026-09-29, two UI workers on one local Mac reduced the full test command from
23m 24s to 17m 13s, with the same 73 tests passing. This did not transfer to hosted
CI: the first hosted run took 34m 17s overall and 28m 53s in the test step, with
72 tests passing and `testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay` failing.
The assertion text did not distinguish which checkpoint failed. Several unrelated
UI tests also slowed substantially: the largest-text graph test took 256s versus
71s in the previous serial hosted run.

The standard arm64 runner has 3 CPU cores and 7 GB RAM; see
[GitHub's runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Shared-runner contention is the leading explanation for the broad slowdown, not
proof of the exact failed assertion. The final workflow removes concurrent Xcode
workers from each machine. Save-retry and fixture assertions now name their
checkpoints without changing test behavior, expected values or timeouts.

The current compiled inventory contains 73 tests, partitioned by class into 17
player tests and 56 remaining tests. A local targeted execution verified combined
`-only-testing` and `-skip-testing` filtering and ran the save-retry test twice;
both iterations passed with the unchanged timeouts. The configuration guard,
actionlint, shellcheck, nonempty-result validation and required-gate failure cases
also passed. Xcode enumeration lists tests outside class-level filters, so its
filtered output is not used as proof that a shard executed the correct set.

Compare complete hosted shard results against the 73-test inventory and record
hosted timings in the PR. The earlier 26.4% local improvement is not a result for
the final workflow.

## Branch and release protection

The four required job names are preserved. This CI replacement does not change
remote rulesets, bypass actors, up-to-date requirements or conversation resolution.
`release-approval` still depends on all four checks for PRs into `main` and uses
the existing human-approval environment. It does not merge, deploy, upload to
TestFlight or submit an App Store release. Feature PRs target `dev`.

## Coverage limits

The current Swift app includes #93–#96 foundation, learning/storage, media/feedback
and principal native product screens, not the completed rewrite.
Green Swift CI proves only the implemented package/app boundaries. It no longer
provides regression evidence for the Expo reference or its StoreKit, CloudKit,
delivery, audio, fonts, dictionary and haptics fixtures. Those sources/tests are
not deleted. Native W4 tests now cover the migrated media/feedback boundaries;
W5 tests cover normal browsing, settings and the audio/video/silent player;
W6 tests cover syntax, scoped analysis, graphs and dictionary ownership;
#98–#99 must add the remaining feature tests as those features migrate.

Simulator CI does not prove real purchases, account switching, CloudKit signing,
hosted delivery, physical-device behavior or release parity. Android remains
future work. Performance benchmarks are not an acceptance requirement.

## Issue references

Feature PRs link related tickets with `Refs #<number>`. Close completed issues
manually after verifying acceptance and merge. There is no custom dev-push
issue-closing workflow, commit scan or issue-write permission in Swift CI.
PR creation alone does not complete an issue.
