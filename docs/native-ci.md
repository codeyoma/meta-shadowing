# Swift pull-request checks

`.github/workflows/ci.yml` validates the standalone app in `native-ios/` on PRs
into `dev`/`main`, pushes to those branches and manual dispatch. PR checkout uses
GitHub's merge candidate, not only the head. The owner approved replacing the
Expo reference CI lane; the reference source remains available for migration.

## Required checks

| Required check | Evidence |
| --- | --- |
| `ci-branch-policy` | Allowed internal feature/release routes and policy regression tests |
| `ci-quality` | Swift Testing suites in `LearningDomain`, `LearningPersistence` and `AppFoundation` |
| `ci-native-tests` | Debug XCUITest: navigation, foreground/relaunch, accessibility text size, failure/retry and SQLite confirmation/relaunch |
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

UI tests run in Debug because the retry test uses a Debug-only failure injection.
Before starting XCUITest, a separate five-minute preparation step waits for
`simctl bootstatus -b` to report that the required iOS 27 Simulator has finished
booting. A readiness failure fails the job; it does not skip or retry failed tests.
The synthetic confirmation test waits for the button to become enabled and
hittable after the asynchronous save, rather than treating unchanged XP as readiness.
Both Debug and Release products are inspected for JavaScript resources, excluded
runtime dependencies/symbols, the iOS 26.0 minimum and unexpected entitlements.
These checks require XcodeGen, `jq` and `rg`; missing build tools are installed
with Homebrew. Toolchain versions are printed for reproducibility.

Actions are SHA-pinned, Swift CI tokens are read-only, and checkout credentials
are not persisted. All jobs have timeouts and no path-based skipping. No signing
credentials, Apple accounts, private lessons or hosted data are needed. UI result
summaries expose test failures without exporting complete simulator logs or
result bundles. Local reproduction commands are in [the native guide](../native-ios/README.md).

## Branch and release protection

The four required job names are preserved. This CI replacement does not change
remote rulesets, bypass actors, up-to-date requirements or conversation resolution.
`release-approval` still depends on all four checks for PRs into `main` and uses
the existing human-approval environment. It does not merge, deploy, upload to
TestFlight or submit an App Store release. Feature PRs target `dev`.

## Coverage limits

The current Swift app includes the #93 synthetic foundation and #94 learning/storage
domain, not the completed rewrite.
Green Swift CI proves only the implemented package/app boundaries. It no longer
provides regression evidence for the Expo reference or its StoreKit, CloudKit,
delivery, audio, fonts, dictionary and haptics fixtures. Those sources/tests are
not deleted. #95–#99 must add the corresponding Swift tests as features migrate.

Simulator CI does not prove real purchases, account switching, CloudKit signing,
hosted delivery, physical-device behavior or release parity. Android remains
future work. Performance benchmarks are not an acceptance requirement.

## Closing completed issues after dev merge

Feature PRs use one standalone `Closes #<number>` line per fully verified issue.
Use `Refs #<number>` for partial work. PR creation does not close issues. GitHub's
normal closing keywords target the default branch, while this repository integrates
features into `dev`; a separate `close-merged-issues.yml` workflow handles that case.

The workflow runs trusted code only on pushes to `dev`. It enumerates the complete
pushed commit range and associated PR pages, then checks merged status, merge SHA,
internal repository identity, `codex/*` source and `dev` destination. Only explicit
same-repository closure lines qualify. Code/quoted examples, foreign issues and
issue numbers that actually identify PRs are ignored. Already closed issues make
reruns idempotent. Incomplete comparisons fail without closing issues.
The parser deliberately supports only a conservative Markdown subset. A line
combining backticks with HTML, comment or blockquote markers disables automatic
closure for the entire PR body; close the issues manually after verifying such a
merge. Ambiguous examples must never be interpreted as completion instructions.

Only this separate job receives `issues: write`; checkout credentials are not
persisted, PR text is never executed, and no privileged `pull_request_target`
workflow is used. Runs are not canceled by a later push. Node regression tests use
mock GitHub responses and do not change remote issues. The workflow becomes active
only after it is merged into `dev`; local tests are not evidence of remote closure.
No ruleset, default branch, release approval or merge permission is changed.
