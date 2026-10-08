# Swift pull-request checks

`.github/workflows/ci.yml` validates the standalone app in `native-ios/` on PRs
into `dev`/`main`, pushes to those branches and manual dispatch. PR checkout uses
GitHub's merge candidate, not only the head. The owner approved replacing the
Expo reference CI lane; the reference source remains available for migration.

## Fast remote checks and local full regression

Owner update, 2026-10-09: ordinary pull requests and `dev`/`main` pushes run
the `light` profile, with no simulator execution. Long checks run in the local
`pre-push` hook, where a failure blocks the push. Manual `workflow_dispatch`
defaults to `full` and also accepts `light`; there is no automatic scheduled full run.

Every remote run retains all six unfiltered host Swift package suites (currently
375 cases), workflow/tooling contracts, and an unsigned generic Debug app build
with product inspection. The Debug build compiles the iOS app without booting a
simulator; it is not a configuration-only or empty build check.

| Execution boundary | Checks |
| --- | --- |
| Automatic GitHub CI | Six host Swift package suites, tooling/configuration contracts, one generic Debug build and Debug product inspection |
| Local pre-push | Complete native simulator suite (currently 183 cases), Debug product inspection, Release build and product/runtime inspection, fictional downloader build |
| Explicit manual full CI | All ordinary checks plus complete shared test-product build, four simulator shards, Release/product/runtime inspection and fictional downloader build |

Automatic runs do not build or transfer test products, boot/install/launch a
simulator, enumerate native tests, or execute UI/native-integration tests. The
entire `NativeMediaIntegrationTests` target also moves to local/manual full
regression: its iOS-only audio, lifecycle, haptics and rendering checks cannot be
replaced by host package tests. No test or assertion is deleted. Ordinary remote
success is not evidence that the 183 native simulator cases ran.

The previous eight-UI-test remote profile still incurred long simulator startup
and automation work. The owner explicitly chose a simulator-free automatic gate
instead. This extends the reduced-PR/full-regression split discussed in
[the primary-source research](research/2026-10-08-native-ci-test-strategy.md)
and [Apple's testing guidance](https://developer.apple.com/videos/play/wwdc2022/110361/).
The exact simulator-free boundary is this project's choice, not a claim that
Apple requires it. Long work moves locally; it is not eliminated, and no particular
hosted duration is guaranteed.

### Install the local hook

Each clone must opt in once. Create a dedicated iOS 27 simulator named
`MetaShadowing Native Pre-push iOS 27`, then pass its ID to:

```sh
bash native-ios/scripts/install-native-git-hooks.sh --simulator-id <SIMULATOR_ID>
```

The installer configures only repository-local `core.hooksPath` and
`native.prePushSimulator`. It refuses a conflicting hook path or an existing
active default hook instead of overwriting it. The runner accepts only the
explicitly configured, dedicated Pre-push simulator on iOS 27. It may boot that
device; it never creates, deletes, erases or selects a physical/reference device.
The interactive W2 preview is not a pre-push destination.

The hook reads Git's actual pushed object IDs, not just `HEAD`. It archives each
unique pushed commit into an isolated snapshot and runs the complete native
scheme and the Release/downloader/product guards from that snapshot. The Debug
inspection reuses the compiled test app instead of building it again. Dirty/untracked working files and private
`Local.xcconfig` are not test inputs. Ref deletions do not need a test run. A
missing tool, simulator, test runner, result or successful test blocks the push.
Concurrent local full runs are rejected, not run against the same simulator.

Successful results may be reused only for the exact commit, Xcode/XcodeGen
versions and configured simulator/runtime. Failed or incomplete results are never
cached; another commit requires another full run. Evidence stays under the local
Git directory, outside tracked source. A same-commit retry after a network failure
does not repeat a completed test run. The archived runner must declare the current
full-gate contract; old runner versions and weaker cached passes cannot satisfy
the expanded Release/downloader checks.

Git hooks are developer-side checks, not a trusted remote enforcement boundary:
they are not automatically installed by cloning and Git can bypass them. A local
commit pass is also not proof of GitHub's merge-candidate revision. Light remote
checks and the existing human release approval therefore remain mandatory.
Before a release, the reviewer must explicitly inspect full-regression evidence
for the intended revision or request manual full CI. No remote ruleset is changed.

## Required checks

| Required check | Evidence |
| --- | --- |
| `ci-branch-policy` | Allowed internal feature/release routes and policy regression tests |
| `ci-quality` | Workflow isolation, runner, hook and result-validation contracts |
| `ci-native-tests` | All six unfiltered host Swift package suites; in manual full mode, also the complete native simulator shards |
| `ci-ios-build` | Clean-checkout configuration and one real unsigned generic Debug app build/product inspection; manual full also verifies Release and the downloader |

Host package tests cover `LearningDomain`, `LearningPersistence`, `AppFoundation`,
`LearningMedia`, `LearningReference` and `AppleServices` on macOS. Each package
must exit successfully and report exactly one positive Swift Testing summary,
without skipped tests or suites. XCTest's zero-test compatibility wrapper is not
the Swift Testing result. Missing, zero, duplicate or failed summaries reject the
run; the total is reported from actual results rather than freezing the current 375.

The generic branch-policy script still uses Node 24 without npm installation.
It is repository governance, not an Expo application check. Hosted checks no
longer install npm dependencies, run TypeScript/JavaScript application tests,
export Expo bundles, run Expo prebuild/CocoaPods or test reference native modules.

## Toolchain and isolation

Swift jobs use the standard arm64 `xcode-27` GitHub-hosted runner (currently a
public preview), with `/Applications/Xcode_27.0.app/Contents/Developer` selected
explicitly. Local/manual UI tests require the iOS 27.0 runtime and fail if it is unavailable;
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

Manual full CI partitions the complete scheme into four disjoint jobs:

| Shard | Selection |
| --- | --- |
| `player` | `PlayerUITests`, excluding the named options methods, plus `OfflineAcceptanceUITests` |
| `player-options` | Twelve methods in `CI_PLAYER_OPTIONS_TEST_METHODS` plus three settings methods in `CI_OPTIONS_EXTRA_TESTS` |
| `product` | `ProductUITests`, `AppleServicesUITests` and `VoiceOverSemanticsUITests`, excluding those three settings methods |
| `remaining` | `-skip-testing` for those five UI classes; every other test remains included |

The full `product` shard includes all VoiceOver audits and label checks.
Inclusion and exclusion flags derive from the same class and method identifiers in the workflow.
The `remaining` shard includes all media integration tests and automatically receives
new UI classes or test targets. New player methods automatically enter `player` unless
explicitly moved to `player-options`; tests in other named classes follow that class.
Each test job uses its own standard hosted runner and passes
`-parallel-testing-enabled NO`, retaining one simulator and existing Swift Testing
suite isolation. A separate `ci-native-build` job builds the complete graph once,
using a generic arm64 simulator destination without booting a simulator. It exports
Xcode's portable `.xctestproducts` package. Four test runners download that exact
artifact by its producer output ID, validate it, then boot their iOS 27 simulator.
They do not generate a project or compile again. Test runners start only after the
shared build; quality and product inspection may still overlap with them if those
jobs have not finished. This removes duplicated compilation, not a concurrency cap.
There are no paid larger runners or external providers.

The run-scoped archive preserves executable permissions and portable internal
links. Metadata pins the checkout revision, exact Xcode version and payload
SHA-256. Missing, damaged or incompatible artifacts fail before installation,
without a cache fallback. Artifact actions are SHA-pinned and artifacts expire
after one day; an expired artifact requires a complete workflow rerun. The output
ID permits failed-job reruns to use their successful producer, even across attempt
numbers. Only fictional-CI products are uploaded, never local profiles or raw logs.

The shared-build, artifact-transfer and simulator jobs are explicit manual-full
jobs only. `ci-test-profile.mjs` validates the selected profile; unknown events,
branches or manual scopes fail. Ordinary PR/push and manual-light runs never
activate these jobs. Behavioral workflow regressions exercise those event paths
and reject accidental simulator commands, test-product builds or heavy artifacts.

`test-ci-test-shards.sh` executes the actual workflow test command against a
controlled process boundary. It verifies disjoint class ownership, every current player
method, every current UI method, valid moved method names, coverage of future classes/targets, serial execution,
test failure propagation, complete enumeration,
unknown-shard rejection and aggregate gate failures. It does not substitute for hosted XCTest.

The matrix uses `fail-fast: false` so a failure in one shard does not suppress the
other shard's results. Each result summary must be nonempty, fully passing and
contain zero failed or skipped tests. The shared result validator compares actual
executed identifiers with the complete compiled inventory filtered by the saved
selection. Unknown selectors, missing/extra/duplicate cases, invalid enumeration,
and inconsistent result counts fail. Empty selection means the entire inventory
for the local full runner, never zero tests. The required `ci-native-tests` job runs
with `always()` and always requires profile and host-package `success`. Light mode
requires the manual-only producer and simulator jobs to be deliberately skipped;
full mode requires both to succeed. Unknown scopes, missing results, cancellations,
or failed applicable jobs cannot make the required check green. Release
approval still depends on this exact required check name.

Test-product build and execution override signing with `CODE_SIGNING_ALLOWED=YES
CODE_SIGN_IDENTITY=-`. This is an ad-hoc simulator signature, not account-based signing.
The free product has no purchase fixture, StoreKit setup scheme or sandbox login.
The normal scheme includes `NativeFoundationUITests` and `NativeMediaIntegrationTests`;
the obsolete purchase-only integration target is removed. All non-commerce tests,
including installation/publication failures, remain in full regression. Unsigned product
inspection stays unchanged. Main test-product compilation has a fifteen-minute
budget. Its build step streams only
allowlisted phase names and verdicts, never compiler arguments, paths or raw
diagnostic payloads. Pipeline failure propagation remains enabled, and a regression
executes the workflow command to verify progress privacy and compiler exit codes.
The complete main scheme owns the final products used by `test-without-building
-testProductsPath`. Preparation and SDK-module phases are also allowlisted, and
the build reports elapsed seconds so time before ordinary Swift compilation is visible.

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
Before starting XCUITest, one eight-minute readiness step waits for
`simctl bootstatus -b`, installs the validated app and launches it once in a
UUID-scoped product profile before `test-without-building`. This retains the
previous total preparation budget of five plus three minutes; the stages share
that deadline rather than enforcing an arbitrary installation/launch split.
No test timeout or retry policy changes. A readiness,
installation or launch failure fails the job. This checks
the app-launch service as well as simulator boot, and fails if launch cannot succeed.
`ci-simulator-resources.sh` is an optional diagnostic utility, not a regular CI
step. It emits allowlisted numeric CPU, memory, load, swap and process counters
without raw process commands, paths, device identities or command errors. Full
process enumeration itself took about 100 seconds on one congested hosted runner,
so those temporary probes were removed after collecting evidence.
Each XCTest still starts a clean app process: [XCUIApplication.launch](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/launch())
terminates any running preflight instance. No test results are manufactured by the preflight.
The synthetic confirmation test waits for the button to become enabled and
hittable after the asynchronous save, rather than treating unchanged XP as readiness.
The load-retry test uses an isolated product profile and verifies that foregrounding
does not consume its explicit retry action. Test assertions include failure messages
so the result summary distinguishes loading, launch-gate and retry failures.
The retry checks explicitly wait for the real launch overlay to disappear, cover
the largest Dynamic Type setting, and include button/window geometry on a hit-test failure.
The full-window launch canvas owns touch interception while artwork is visible;
underlying SwiftUI content keeps stable hit testing, with accessibility hidden until
launch finishes. A native-window test verifies interception and removal at normal
and maximum text sizes. This protects the launch boundary but does not reproduce
or establish the cause of the intermittent hosted retry-button failure.
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
Each native shard retains a 40-minute budget, including download and simulator setup;
the test step remains bounded at 30 minutes. The shared build has a 20-minute job
budget and retains the 15-minute compilation limit. A previous 30-minute
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

### October 8 rendered-view test restructuring

The preceding shared-product run `37777490151` passed in 33m 02s. Its player job
spent 25m 08s executing nineteen UI test methods; their case durations summed to
23m 57s. Five layout-focused methods accounted for 6m 43s of those case durations.
Those five methods now run their geometry/pixel assertions in the existing native
integration target, without repeatedly launching and navigating the app.

| Former UI method | Rendering coverage and retained interaction coverage |
| --- | --- |
| `testPlayerHeaderGroupsTitleAndProgressBesideLeadingOptions` | Actual `LearningPlayerView`, short/long title and normal/maximum text matrices; title centering, progress ordering/bounds, counter trailing alignment and zero credit. The separate-exit absence check remains in the real-audio UI journey; options opening/exiting remains covered by the options UI tests. |
| `testShortLearningContentCentersBetweenFixedControls` | Actual player with audio/video and both text sizes; original/translation union measured between the real safe-area bars. Actual main-action taps remain in normal/large audio and video reward UI journeys. |
| `testHeaderActionsHaveIndependentMinimumTouchTargets` | All three actual header frames remain at least 44 points in the hosted title/text-size matrix. Their actual hitability checks move into the real-audio UI journey. |
| `testSentenceProgressUsesThePrimaryActionColor` | The production `PlayerTitleView` renders a completed-unit session; the unchanged pixel threshold verifies yellow fill. Real three-cycle confirmation, Next, source advance and exact XP remain in `testNextIsIconOnlyAndStillConfirmsExactlyOneCycle`. |
| `testActiveCycleRingStaysInsideTimelineAtEveryNode` | Production `CycleTimelineView`, all three active nodes, nonempty green pixels and unchanged clipping-edge checks at the device display scale. Real completion/confirmation and exact two-cycle credit remain in the repeated-rewards UI test. |

The full player is hosted in a real `UIWindow` using the real flow, catalog and
SQLite workspace. Debug-only `PlayerLayoutMeasurements` observes actual SwiftUI
geometry through a nil-by-default environment value; the UI never reads the
recorded values back. It adds no layout, gesture or state replacement. Release
uses an identity modifier, and product inspection rejects measurement symbols.
Every sample uses a fresh recorder/window and requires nonempty settled frames;
full-player samples also use isolated profiles. A frame is not evidence of hitability, clipping or accessibility semantics:
pixel assertions, real interaction tests and the existing VoiceOver gate remain.

The real `9/12` to `10/12` source-selection UI test is retained, including its
displayed-text, paused-state, width and position assertions. A fast component
regression additionally checks the same width boundary. Reward animation,
scrolling, real audio/video, lifecycle, retry, relaunch, durable credit and settings
tests are not replaced with snapshots, seeded completion or synthetic end buttons.

Each of the five new rendering tests was checked with an isolated production
mutation: left-aligned title, top-aligned content, removed counter-width reservation,
wrong progress tint and removed ring clearance. Every corresponding test failed;
all mutations were restored. The final focused run passed five rendering tests and
the retained real-audio/source-selection UI tests (7/7). Local rendering case time
was about three seconds, excluding build/runner startup; it is not a hosted-speed claim.

The paused-rate preference-isolation UI method moves from options to player to
rebalance the remaining work. Run `37788656914` passed all 183 native tests and
375 package tests. Player execution dropped from 25m 08s to 16m 14s, and the new
rendering suite occupied approximately seven seconds of the hosted log timeline.
However, the complete workflow took 34m 26s versus 33m 02s: the remaining shard
spent 5m 19s before its first test and 19m 48s in its existing UI cases. This is not
evidence of an overall CI speedup or a diagnosis of the underlying hosted delay.

The two controlled-offline UI journeys therefore move from remaining to player,
using complementary class selectors. Both routing changes have process-boundary
red/green regressions; all current and future methods retain exactly one owner.
Four runners, serial execution, required checks, no-retry policy and existing UI
deadlines remain unchanged. Reverify hosted timing and the complete executed
inventory after this rebalance; do not extrapolate a guarantee from one run.

### October 8 shared-product follow-up

PR #127 run `37754940528` passed all 180 native cases with zero failures/skips,
but took 41m 52s overall. Each shard compiled the same full graph: options 4m 40s,
player 11m 17s, remaining 13m 27s and product 12m 33s. The previous successful
run `37714033941` took 33m 38s; build phases ranged from 5m 47s to 8m 36s.
Shared products remove three complete compilations. Booting only after receiving
the products also removes simulator contention from the build job; contention's
share of the old variability is not established by these timings alone.

The settings-summary relaunch, font-persistence and rate-preference tests move
from product to options. They accounted for approximately 194 seconds in the
previous successful run. Assertions and fixture launches remain unchanged.
Hosted timing and complete case inventory must be reverified after this change;
the structural regressions and local portable-product run are not hosted results.

The first hosted shared-product trials exposed a cold-installation budget issue:
run `37762629769` spent 151 seconds installing the app in the product runner,
leaving approximately twenty seconds of the combined three-minute preflight for
launch. The former per-runner compilation had delayed installation after boot.
The first adjustment assigned installation to the five-minute preparation phase,
but another runner still exhausted that phase while most launch time went unused.
Run `37767394596` then showed one-minute system load above 500 on a three-core
runner before the app launched; swap counters remained zero. This demonstrates
whole-runner congestion, not a proven memory-exhaustion or installer root cause.
Boot, installation and launch now share the unchanged eight-minute readiness
budget. Safe phase markers remain; heavyweight resource probes do not. This
redistributes the existing preparation allowance, not an increase or an automatic retry. A fresh cold local
simulator accepted the exact hosted artifact; that does not establish hosted
reliability or explain every runner's installation latency.

### Earlier four-shard partition

On October 7, PR #126 run `37655283521` exhausted the 40-minute `remaining`
job budget. Compilation took 8m 07s, and the test step was cancelled after 30m 13s
while entering the first VoiceOver audit. All 45 completed UI cases passed; the
unfinished audits and integration tests were not passing coverage. The `player`
shard completed its 31 cases in a 25m 01s test step.

The October 8 partition moves `AppleServicesUITests` (8m 11s of completed cases),
`ProductUITests` (7m 07s), and all VoiceOver checks into the `product` job.
The other completed UI cases accounted for about 14 minutes. This removes measured
work from the overloaded runner while preserving the 40-minute job and 30-minute
test-step limits. It adds one cold setup/build; the expected wall-clock improvement
must be verified in a new hosted run. Assertions, test deadlines, retries, required
checks and human release approval are unchanged.

Run `37710216639` completed `product` in 29m 53s with all 24 cases passing and
`remaining` in 31m 49s with 98 of 99 cases passing. The latter failed the normal-text
Retry button hit-test assertion, not a timeout; that intermittent failure remains
under investigation. The player job still exhausted its 40-minute budget after a
cold build of over ten minutes: 30 cases passed, one was unfinished and the final
case did not start. Its completed cases alone summed to 26m 32s.

The follow-up partition moves thirteen player options cases to `player-options`,
leaving nineteen player cases in `player`. The moved cases that completed in this run
accounted for about twelve minutes; the additional unfinished options case took
61 seconds in the preceding successful run. The method list drives both selections,
so new player tests remain included by default. This adds another cold setup/build
without increasing job/test limits or changing assertions. Hosted verification of
this four-runner partition is pending; local command checks do not prove hosted timing.

### Historical two-shard baseline

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

The #108 controlled-offline acceptance journeys run in the existing `player`
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
