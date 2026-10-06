# Swift pull-request checks

`.github/workflows/ci.yml` validates the standalone app in `native-ios/` on PRs
into `dev`/`main`, pushes to those branches and manual dispatch. PR checkout uses
GitHub's merge candidate, not only the head. The owner approved replacing the
Expo reference CI lane; the reference source remains available for migration.

## Required checks

| Required check | Evidence |
| --- | --- |
| `ci-branch-policy` | Allowed internal feature/release routes and policy regression tests |
| `ci-quality` | Swift Testing suites in `LearningDomain`, `LearningPersistence`, `AppFoundation`, `LearningMedia`, `LearningReference` and `AppleServices` |
| `ci-native-tests` | Debug XCUITest plus actual iOS media/lifecycle/feedback and free-package recovery adapters |
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
It also verifies that both complete non-commerce test targets occur exactly once, with no
selected or skipped tests in the scheme and serial execution for every target.

CI partitions the complete scheme into two complementary jobs:

| Shard | Selection |
| --- | --- |
| `player` | `-only-testing:NativeFoundationUITests/PlayerUITests` |
| `remaining` | `-skip-testing:NativeFoundationUITests/PlayerUITests` |

The `remaining` shard includes `VoiceOverSemanticsUITests`, so VoiceOver audits and label checks run on every PR. Both selections derive from the same class identifier in the workflow. The first
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

Test-product build and execution override signing with `CODE_SIGNING_ALLOWED=YES
CODE_SIGN_IDENTITY=-`. This is an ad-hoc simulator signature, not account-based signing.
The free product has no purchase fixture, StoreKit setup scheme or sandbox login.
The normal scheme includes `NativeFoundationUITests` and `NativeMediaIntegrationTests`;
the obsolete purchase-only integration target is removed. All non-commerce tests,
including installation/publication failures, remain covered. Unsigned product
inspection stays unchanged. Main test-product compilation has a fifteen-minute
budget. Its build step streams only
allowlisted phase names and verdicts, never compiler arguments, paths or raw
diagnostic payloads. Pipeline failure propagation remains enabled, and a regression
executes the workflow command to verify progress privacy and compiler exit codes.
The complete main scheme owns the final products used by `test-without-building`.

## Historical purchase-fixture investigations

The following setup and purchase-test evidence predates #108. Those requirements
are superseded by the free-only owner decision, not passed as live purchase
acceptance. No current CI step runs the retired setup or transactions.

The September 30 hosted run timed out during setup compilation at the former
ten-minute step limit, before setup or behavioral tests ran. The preceding run
finished that same setup build in 6m 12s. The quiet log cannot distinguish slow
compilation from a stall; the new progress output exposes the last build phase.
The compilation allowance remains bounded by the forty-minute shard limit.
No XCTest deadline, assertion, shard selection, skip or retry policy changed.

On October 1, both actual workflow build commands passed locally using a fresh
DerivedData directory, followed by the separate one-case StoreKit setup. The
progress regression failed before the filter existed and failed again when
pipeline failure propagation was deliberately removed; the restored commands
passed success, failure and private-output checks. Actionlint, shellcheck,
clean-checkout configuration generation and the Debug product guard passed.
All 360 package tests passed. These checks do not reproduce hosted build speed.

The first local integration run passed 69 cases and failed
`verificationFailureIsNotDefinitiveLossAndCannotCreateOwnership` while waiting
for fixture entitlements. Diagnostic executions passed the isolated case and
all 19 ownership cases; the cache probe did not establish a stale-cache cause.
After removing every temporary probe, the final media/reference and StoreKit
integration run passed all 70 cases with zero failures or skips. The intermittent
failure is not claimed fixed by a budget or logging change. App sources,
behavioral tests and their deadlines remain unchanged; no hosted retry was added.

A clean iOS 27 reproduction showed fixture product and entitlement queries using
Xcode's local store while `Product.purchase()` in the same initial process requested
Sandbox authentication. A minimal host reproduced it without application services.
Installing the fixture in an earlier process, followed by a new host launch, allowed
the same real purchase to return a verified `.xcode` transaction without any login.
The app also avoids opening StoreKit transaction streams or querying entitlements
when no product is configured. Local verification must include a newly created
simulator; a previously initialized simulator alone cannot detect this setup failure.
Local verification on 2026-09-29 passed the setup check and all 79 `remaining` tests
on the newly created simulator, plus all 17 player tests on the existing dedicated
simulator. All 337 package tests passed. These are local results, not a claim that
the subsequent hosted run has completed.
## Current execution and reporting

The build job also validates the service configuration mapper and builds a fictional,
unsigned ExtensionKit downloader without launching it or contacting Apple services.

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
Transient reward tests match the receipt identifier and exact committed XP label
in a single accessibility query. Separate existence and label snapshots can race
the unchanged two-second receipt lifetime on slower runners. Completion receipts
are observed before checking durable stage state; identifier-only queries still
verify their disappearance and absence after relaunch. These tests do not extend
receipt timing, weaken credit assertions or add CI retries.

Local validation on 2026-09-30 reproduced the missing-receipt snapshot with a
controlled delay between the old existence and label reads. The corrected test
passed; deliberately expecting the wrong XP label then failed its exact-label
assertion. After restoring the correct expectation, the complete, unfiltered
iOS 27 scheme passed all 123 cases with zero failures or skips, including all
19 player tests. The separate StoreKit setup check and all 360 package tests
also passed. Four existing reveal-WPM frame warnings remain; these local results
do not establish a passing hosted run.

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

That historical compiled inventory contained 73 tests, partitioned by class into 17
player tests and 56 remaining tests. A local targeted execution verified combined
`-only-testing` and `-skip-testing` filtering and ran the save-retry test twice;
both iterations passed with the unchanged timeouts. The configuration guard,
actionlint, shellcheck, nonempty-result validation and required-gate failure cases
also passed. Xcode enumeration lists tests outside class-level filters, so its
filtered output is not used as proof that a shard executed the correct set.

Compare complete hosted shard results against the current compiled test inventory and record
hosted timings in the PR. The earlier 26.4% local improvement is not a result for
the final workflow.

## Branch and release protection

The four required job names are preserved. This CI replacement does not change
remote rulesets, bypass actors, up-to-date requirements or conversation resolution.
`release-approval` still depends on all four checks for PRs into `main` and uses
the existing human-approval environment. It does not merge, deploy, upload to
TestFlight or submit an App Store release. Feature PRs target `dev`.

## Coverage limits

The #108 controlled-offline acceptance journeys run in the existing `remaining`
shard. A Debug-only transport failure is enabled only in UUID-isolated product
profiles. Tests retain real validation, installation, SQLite and native playback;
they verify offline relaunch, saved cycles/preferences, local source navigation,
no implicit confirmation and explicit recovery after failed re-acquisition.
Package tests reconstruct the installed syntax catalog without any delivery
transport. Existing reference UI, monitoring policy and native AVAudioEngine gain
tests remain part of the same complete checks, not replaced by the new journey.

`native-ios/scripts/test-offline-acceptance.sh` runs the repeatable local subset
plus all six complete package suites on an already booted dedicated iOS 27
simulator. Its runner regression executes in `ci-quality` and rejects package/build
failure, missing/empty results, skipped tests, missing selected groups and an older
or unresolved destination. Controlled external-service failure is not physical
radio-off, Apple-server delivery, dictionary-definition or perceived-microphone
acceptance. The runner never changes radios, accounts or a physical installation.

The current Swift app includes the migrated learning/storage, media/feedback,
product UI, reference tools, hosted delivery and optional private recovery boundaries.
Green Swift CI proves only the implemented package/app boundaries. It no longer
provides regression evidence for the Expo reference or its StoreKit, CloudKit,
delivery, audio, fonts, dictionary and haptics fixtures. Those sources/tests are
not deleted. Native W4 tests now cover the migrated media/feedback boundaries;
W5 tests cover normal browsing, settings and the audio/video/silent player;
W6 tests cover syntax, scoped analysis, graphs and dictionary ownership;
W7's former purchase tests are retired under #108. Native suites retain hosted
installation, profile isolation, conditional private sync, restart recovery and
distinct deletion controls. See [the service contract](swift-native/apple-services-contract.md)
and [current free-package evidence](swift-native/free-package-acceptance.md).

Simulator CI does not prove account switching, CloudKit signing,
hosted delivery, physical-device behavior or release parity. Android remains
future work. Performance benchmarks are not an acceptance requirement.
Purchases and their sandbox acceptance are not current release gates.

## Issue references

Feature PRs link related tickets with `Refs #<number>`. Close completed issues
manually after verifying acceptance and merge. There is no custom dev-push
issue-closing workflow, commit scan or issue-write permission in Swift CI.
PR creation alone does not complete an issue.
