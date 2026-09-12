# Private progress backup — verification and setup

Ticket #49 is in development. No real CloudKit backup or clean-install restore
has been demonstrated yet. Do not interpret local tests as Apple service evidence.

## Separate responsibilities

- Each phone owns its SQLite learning data and downloaded lesson files.
- Private CloudKit contains that iCloud user's progress backup, not purchased
  lesson audio/text or a mutable purchase entitlement.
- StoreKit independently verifies the App Store account's purchases.
- No Supabase or separate email registration is used in this native app.

See the [design](superpowers/specs/2026-09-12-cloudkit-progress-design.md) and
[implementation plan](superpowers/plans/2026-09-12-cloudkit-progress.md).

## Apple setup prerequisites

Before real service tests, the owner must confirm the app's iCloud container,
development signing with CloudKit and remote notifications, and a designated
iCloud test account. Do not use the Sandbox purchasing account as a substitute
for a device iCloud identity. Never request the account password in an issue/chat.

The local configuration variable is `APPLE_CLOUDKIT_CONTAINER`; its value
belongs in ignored local configuration, not public source or issue attachments.
`APPLE_CLOUDKIT_ENVIRONMENT` is `Development` by default. A later authorized
production build must explicitly use `Production` and verify that the generated
metadata and final signed iCloud entitlement agree; the profile namespace includes
this environment. Do not use a development namespace for a production build.
The config plugin must preserve existing purchase configuration and unrelated
entitlements. Generate and inspect entitlements before device testing. Missing
configuration must leave local learning usable and identify backup as unavailable.

Signing validation belongs to the build and device-test preflight, not a runtime
requirement for an embedded provisioning-profile file. App Store-distributed apps
do not retain that file. The native module uses plugin-generated configuration;
the simulator service path is deliberately unavailable, while isolated native
tests exercise the transport with a controlled external boundary. Real cloud
acceptance requires a correctly signed physical build.
[Apple provisioning-profile guidance](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles).

Development and production CloudKit environments are distinct. This ticket does
not authorize production schema deployment, public distribution, or legal/paid
agreement acceptance. Follow [Apple's CloudKit setup instructions](https://developer.apple.com/documentation/cloudkit/enabling-cloudkit-in-your-app).

## Controlled device acceptance protocol

1. Use a designated test build/profile with only controlled sample practice.
   Preserve any pre-existing phone data before considering uninstall or reset.
2. Complete one sample run and leave another run unfinished at a known phrase,
   cycle, playback speed and audio position. Record the known completion count,
   XP, original practice day, preferences and selection without account identifiers.
3. Enable iCloud backup explicitly. Confirm that declining guest import sends no
   guest history; then exercise the approved import flow with the test data.
4. Wait for an actual acknowledged backup, including its published head. A queued
   request, local revision or displayed spinner is not cloud acknowledgement.
5. With separate owner authorization for that exact test installation, perform a
   clean-install recovery. Select the confirmed backup and compare the recorded
   values. Restore again: XP and completion count must remain unchanged.
6. Disable connectivity and study locally. Restore connectivity and verify a delayed
   backup covers the new local revision. Repeat with delayed responses and a retry;
   an older acknowledgement must not clear a newer pending change.
7. Exercise no-account, quota and account-change failures using controlled accounts
   or external-boundary fixtures as applicable. Record which were real Apple
   responses versus simulated errors. Never send one profile's data to another.

Unsynchronized progress can be lost on uninstall. No test may claim recovery of
data that never reached iCloud. Concurrent two-device merging belongs to #50;
full account deletion journeys belong to #51.

## Evidence during this implementation

- Before #49 code changes: 75 TypeScript domain tests passed; typecheck passed.
- The transactional SQLite backup store passed 7 focused tests, a full 82-test
  domain run, and typechecking. Independent review reran all 7 focused tests and
  found no actionable spec or code-quality defect. These tests use real local
  SQLite; they are not evidence of an iCloud upload.
- #45 native StoreKit regression rerun: 12 passed, 0 failed, 0 skipped.
- Generated app entitlements inspected before #49: no CloudKit configuration.
- The first native transport implementation passed 11 controlled Swift tests,
  85 domain tests, typechecking and an integrated iOS app compile. Independent
  review then identified two adapter-level gaps: retry after temporary CKAsset
  file-read failure and concurrent account activation. Fixes and re-review are
  complete, including a related delayed account-notification fix. The original
  green tests did not establish coverage for those gaps; the new regressions
  reproduced each failure before correction.
- After the fix and scoped re-review passed, the controller independently reran
  the native suites: 14 CloudKit tests in 3 suites and 12 StoreKit tests passed.
  A fresh disposable test-host build version avoided stale installed test binaries.
  No production/user app was uninstalled or reset. The corrected native code and
  Expo bridge also passed the integrated Swift 6 app compile.
- Account integration passed 13 focused coordinator/profile tests using real
  SQLite and controlled external CloudKit responses. The controller then reran
  the full suite: 98 tests passed, none failed or skipped; typechecking and
  whitespace checks passed. Tests cover explicit guest consent, default preference
  isolation, stale account responses/choices, original-session save failures,
  atomic profile selection, delayed acknowledgements and foreground offline retry.
- The integrated Release Simulator build succeeded. Native Settings inspection
  confirmed one purchase-restore action, an unavailable iCloud state without
  enable/import actions, and a quiet retry returning to the same screen. The
  screenshot and build result were independently inspected. This does not verify
  an available-account profile switch, real upload, or clean-install recovery.
- Physical CloudKit recovery and real StoreKit sandbox acceptance remain pending.

The final report must update these entries with measured results, preserving the
distinction between local verification and real sandbox/CloudKit acceptance.
