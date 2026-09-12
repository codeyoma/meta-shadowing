# Native pull-request checks

The iPhone-first branch replaces web deployment and Supabase CI with native
validation. `.github/workflows/ci.yml` runs on PRs into `dev`/`main` and pushes
to those branches. PR checkout uses GitHub's merge candidate, not only the head.

| Required native check | Evidence |
| --- | --- |
| `ci-branch-policy` | Allowed internal feature/release routes and executable policy regression tests |
| `ci-quality` | Locked npm install, domain and real SQLite tests, TypeScript, iOS JavaScript/assets export |
| `ci-native-tests` | Real StoreKitTest purchase/query/update scenarios and native CloudKit transport/storage fixtures on iOS Simulator |
| `ci-ios-build` | Fresh Expo iOS generation, pods, and standalone Release Simulator build including native modules |

Linux jobs use Node 24; native jobs use the standard `macos-26` runner and
Xcode 26.6. [Runner toolchain inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).
Native fixture tests explicitly select the iOS 26.5 runtime rather than the first
installed iOS 26 device. The initial hosted run selected 26.4.1 and failed StoreKit
test actions; Apple documents the configuration-selection fix in
[iOS 26.5 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_5-release-notes).
This pins the test harness, not the app's iOS 26.0 deployment minimum. Test result
summaries expose assertion failures without dumping account/device metadata.
Actions are pinned to commit SHAs, tokens are read-only, checkout credentials
are not persisted, and private local environment files are not loaded. No
signing credentials, Apple accounts, private lessons or hosted data are needed.
Jobs are bounded, fail on failed commands, and have no path-based skipping.

## Protection migration

For `dev`, replace obsolete `ci-browser`/`ci-database` requirements with
`ci-native-tests`/`ci-ios-build` only after the new jobs pass on the current PR.
Keep `ci-branch-policy`, `ci-quality`, strict up-to-date checking, GitHub Actions
as the expected source, required conversation resolution, and all other rules.
Do not create dummy passing checks or add bypass actors. Read back the live
ruleset after applying it; a committed workflow alone does not change rulesets.

This PR does not change `main` protections. Its legacy check requirements must
be migrated during a separately authorized native release preparation. The
workflow retains `release-approval` on PRs into `main`, after all native checks,
using the existing human-approval environment. It does not merge, deploy, upload
to TestFlight or submit an App Store release.

## Limits

Local StoreKitTest and CloudKit fixtures do not prove live sandbox purchases,
CloudKit container/signing, physical-device account switching, hosted content
delivery or complete UI behavior. #45/#49 and later iPhone acceptance gates
remain open until their real-service evidence exists. Android is future work;
these checks do not claim Android support.
