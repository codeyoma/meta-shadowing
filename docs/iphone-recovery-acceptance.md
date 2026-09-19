# iPhone recovery acceptance — #52

## Scope and verdict

Local acceptance coverage, based on `dev` at `dec5520`. **Physical-device and
live-service acceptance remains incomplete and is now tracked in #61.** #52 was
closed to consolidate the backlog; its closure does not mean those checks passed.
The purchased-package journey still requires an active paid agreement, a working
sandbox product, the #47 entitlement-to-package integration, and physical-device
TestFlight/CloudKit evidence. A free sample is not evidence of paid access.

No real purchase, account change, user-data deletion, app uninstall, App Store
submission, or private package upload is part of this local run. Fixture deletion
affects only disposable test data. Private DUO content must remain outside Git.

## Added regression journeys

`src/core/progress-sync.test.ts` adds two `recovery journey:` scenarios using
the public `Player`, journal, `ProgressProfiles`, and `ProgressSync` interfaces:

1. Confirm one cycle and publish it; confirm another while transport is offline.
   Reconstruct the coordinator over the retained database and verify 2 XP and the
   paused checkpoint. A fresh empty installation restores only the published
   cycle (1 XP), not the unuploaded cycle. Reconnect the original installation;
   both converge to 2 XP and the saved audio position without a stage completion
   or duplicate award.
2. Restore an existing account on a second installation, then study offline.
   Delete cloud learning from the first installation and confirm new learning.
   Reconnect the stale installation: pre-deletion learning cannot return, and its
   old player writer is rejected. A fresh installation restores the new learning;
   switching to another fixture account exposes none of it, and switching back
   restores exactly the new account history.

The databases are real **in-memory SQLite** databases. Coordinator reconstruction
is not a process kill or disk-persistence test. Audio and Apple transport are
controlled fixtures. Existing `journal.test.ts` separately covers closing and
reopening disk-backed SQLite. These tests do not combine real StoreKit, delivery,
CloudKit and audio into one physical-device end-to-end flow.

Focused reproduction (Node with `node:sqlite` support):

```sh
npx tsx --test --test-name-pattern='recovery journey:' src/core/progress-sync.test.ts
npx tsx --test src/core/progress-sync.test.ts
npm run typecheck
npm run check
```

Native reproduction requires Xcode, XcodeGen, an installed iOS 26.5 simulator and
the generated Expo iOS workspace with pods installed (see `docs/native-ci.md`).
Select the ID of a disposable simulator; never substitute a physical device for
these fixture destinations. For each pair below, generate and run its scheme:

| Fixture directory | Project / scheme |
| --- | --- |
| `tests/storekit` | `PackageStoreTests` |
| `tests/cloudkit` | `ProgressCloudTests` |
| `tests/delivery` | `PackageDeliveryTests` |
| `tests/learning-audio` | `LearningAudioTests` |

```sh
xcodegen generate --spec tests/storekit/project.yml
xcodebuild test -project tests/storekit/PackageStoreTests.xcodeproj \
  -scheme PackageStoreTests \
  -destination 'platform=iOS Simulator,id=<TEST_SIMULATOR_ID>,arch=arm64' \
  -parallel-testing-enabled NO -quiet
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 xcodebuild \
  -workspace ios/app.xcworkspace -scheme app -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO -quiet
```

The app build here reuses the local generated workspace. It is not a clean
prebuild/CI reproduction or proof of TestFlight signing/configuration.

## Acceptance matrix

| #52 requirement | Local evidence / coverage | Remaining gate |
| --- | --- | --- |
| Real sandbox purchase and Apple-hosted TestFlight download | StoreKitTest and native delivery fixtures exist separately | Active paid agreement; designated sandbox identity and product; #47 integration; physical iPhone |
| Explicit download, complete validation, offline manual study | Delivery installation/recovery tests; player and disk-backed journal tests | Combined purchased-package flow with Metro stopped and networking disabled |
| Cloud upload, reinstall, purchase/progress restore | Added uploaded-versus-unuploaded journey; native purchase restore fixtures | Real CloudKit upload and approved disposable TestFlight reinstall |
| Download interruption, storage failure, removal/reinstall | Native delivery/storage fault fixtures | OS-managed download interruption and actual device storage recovery |
| Pending/cancelled purchase and refund/revocation | Native StoreKitTest scenarios | Sandbox behavior and paid-package access enforcement |
| Offline sync, two-device conflict, account changes | Real SQLite merge/account tests and added lifecycle journeys | Two physical devices and designated test identities; local fixtures are not a substitute |
| Learning deletion and stale-device resurrection | Reset-generation tests and added stale-writer/reinstall journey | Verify real CloudKit deletion while StoreKit purchase history remains intact |
| No Supabase | Static dependency/configuration scan described below | Representative runtime network observation |
| Regression, build, accessibility | Local commands below; source accessibility inspection | VoiceOver, Dynamic Type and device interaction evidence |

## Local verification — 2026-09-19

- Node 26.8.1; Xcode 27.0; native fixture destination iOS Simulator 26.5.
  CI separately pins its documented Node/Xcode/runtime versions.
- Added journey tests: **2 passed**. These characterize existing behavior and
  passed on the first run; no product behavior fix or red-to-green claim is made.
- `npm run check`: **337 core tests, 8 build-setting tests, 3 free-package tests
  passed**, followed by successful TypeScript checking.
- `EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios`: passed.
- Full focused sync test file: **76 passed**.
- Native fixture result bundles: StoreKit **14 passed**, CloudKit **53 passed**,
  delivery **20 passed / 1 skipped**, learning audio **4 passed**. These are
  simulator service/transport fixtures, not live sandbox/CloudKit acceptance.
  The skipped delivery case requires `DUO_PREPARED_PATH` and private content;
  this run intentionally did not supply it.
- Release Simulator build: **exit 0**, with a newly generated arm64/x86_64
  executable verified. The initial build printed dependency warnings and
  contradictory `SwiftCompile` diagnostics saying a command "failed with exit
  code 0". An unchanged incremental rerun exited **0 with no output**. This is
  not a warning-free clean build claim; the initial diagnostics' root cause was
  not established. No dependency/compiler settings were changed to silence them.

### Static service and accessibility inspection

No case-insensitive `supabase` matches were found in tracked `package.json`,
`package-lock.json`, `app.json`, `src`, or `modules`, nor in the local generated
`ios/Podfile.lock` and app `Info.plist`. This is a bounded static scan, not a claim
about all runtime traffic. No packet capture or real Apple account traffic was
observed in this run; no hosted resources were contacted or changed by the scan.

Source inspection confirmed download progress exposes a progressbar label/value,
cancel exposes a button label/disabled state and a 44pt minimum width, sync exposes
a labelled switch, and deletion exposes labelled disabled/retry controls. No new
UI was added. This is not a VoiceOver or large-text interaction pass.

## Physical-device continuation (not executed)

1. Confirm the paid agreement is active and the designated sandbox product loads.
   Finish #47 before treating a verified transaction as a downloadable lesson.
   Use controlled content or content explicitly authorized for this distribution.
2. Record sanitized build/version, OS version, package version, environment, and
   pass/fail observations. Keep account/device/transaction identifiers, private
   lesson text, filesystem paths and raw logs out of public evidence.
3. On an explicitly designated disposable installation, purchase in sandbox,
   tap Download, wait for complete validation, stop Metro and go offline. Confirm
   a cycle, interrupt an unfinished cycle, and reopen without duplicate XP.
4. Reconnect, verify cloud acknowledgement, then obtain explicit approval before
   uninstalling that exact test installation. Reinstall, restore StoreKit
   purchases, explicitly redownload, and restore progress. Unuploaded learning
   is intentionally not promised recoverable.
5. Exercise the recovery matrix using controlled fault seams. Do not fill the
   owner's storage or delete their app/records just to force a failure. Use a
   second approved device for stale offline learning and account isolation.
6. Observe representative network activity and perform VoiceOver/large-text
   checks on purchase, progress, retry, restore and deletion controls. Record
   these outstanding results in #61. None of this authorizes a public release.

## Review

- **Standards:** no hard violations or actionable design smells. One cleanup-order
  finding was fixed: both journeys register player disposal before fixture
  database closure, including on early assertion failure. The reviewer verified
  the fix; focused tests and the full `npm run check` passed again afterward.
- **Spec:** no blocking findings against the owner-approved local-automation
  scope. Native reproduction commands were added. Full #52 physical-device and
  real-service acceptance remains pending in #61 as shown in the matrix.
