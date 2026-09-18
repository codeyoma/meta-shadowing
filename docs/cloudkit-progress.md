# Private progress backup — verification and setup

## Current automatic synchronization — #50, 2026-09-18

The automatic-sync design supersedes the older manual local/cloud winner flow
recorded below. Those dated verification entries remain historical evidence, not
the current UI or proof of #50 physical acceptance.

- `자동 동기화` checks at startup/foreground, network return and every 60 seconds
  while active. There is no fixed background/terminated execution promise.
- SQLite merges confirmed learning and completion identities independently of
  the latest ordered resume checkpoint. Duplicate delivery earns nothing; older
  resume locations can win only by learning order, never by download order.
- Current player state stays pinned. A private writer preserves its predecessor
  even if another device changes the selected checkpoint. An unchanged pause or
  dispose cannot overwrite the newer selection. Library selection is refreshed
  outside the player; next safe entry chooses the latest available learning point.
  Browsing a different book does not replace that independently ordered learning
  selection. An unavailable package version is not silently replaced with another.
- `지금 동기화` uses the same safe two-way merge while leaving automatic sync off.
  Nonempty guest history still requires account-ownership consent; an empty guest
  does not. Disabling sync or changing accounts never deletes local history.
- All legacy candidates must validate before their union is written. Head races
  retry up to three times per pass, then wait quietly. A missing old candidate
  after a competing publication is contention, not corruption. Actual corruption,
  incompatible versions and storage failures do not trigger an overwrite path.
- Equal-content adoption retains exact native pending-asset cleanup authority.
  Publication acknowledges only its captured SQLite revision. Lost responses and
  later edits remain recoverable through the next equality/merge pass.
- **Update every participating device before using automatic sync.** An older
  installed client can still use its old overwrite path; mixed v3/v4 writers and
  app downgrades are unsupported. The CloudKit namespace was not changed.

Backup v4 retains confirmation identities, original dates, mutation clocks and
conservative legacy credit candidates. It imports v1–v3 without inventing earned
XP. Opaque historical credits use candidate maxima, not summed duplicated totals.
The 16 MiB transport bound still applies. This is private progress only: no
StoreKit ownership or commercial package payload is synchronized.

Local synchronization metadata stores each run separately in SQLite. Ordinary
checkpoints update only their run; export/merge still validates the complete
ledger. Migration from the earlier single-row ledger is atomic and retryable.
Wire encoding is shared by local export and remote validation, so equivalent
compressed payloads do not cause repeated publications.

### Local verification — 2026-09-18

- TypeScript typecheck and all 297 tests passed, including independent SQLite
  installations, offline merge orders, duplicate delivery, live-player writes,
  interrupted local migration and latest-learning versus browsing selection.
- Native CloudKit transport/lifecycle tests: 37 passed on an iOS 27 simulator.
- Build-settings (8), free-package (3), and native-header (7) checks passed.
- iOS production JavaScript export and unsigned Release simulator build passed.
- Local in-memory SQLite timing for ordinary checkpoint writes with 2,400
  historical runs improved from 76–121 ms to 0–1 ms. This is not an iPhone
  performance measurement or a real CloudKit acceptance result.

### Remaining physical acceptance

On two authorized devices running this version under the same designated iCloud
account: enable sync, learn distinct and overlapping runs offline, reconnect in
both orders, compare XP/completions/latest resume, and repeat sync plus relaunch.
Also check a live player during remote updates, airplane-mode return, account
switching and toggle-off behavior. Do not uninstall or reset either device.
Local SQLite tests, native transport fixtures and successful builds do not close
this real-service gate or the pre-existing #49 gates.

See the [approved design](superpowers/specs/2026-09-18-automatic-progress-sync-design.md)
and [implementation plan](superpowers/plans/2026-09-18-automatic-progress-sync.md).

Ticket #49 remains open. A physical-device fresh CloudKit download, isolated
SQLite restore and normal clean-install UI recovery matched the captured learning
records on 2026-09-13. The tested baseline has no completed runs or XP awards;
do not generalize that evidence to nonempty reward history or all failure cases.

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
- The combined #45/#49 review found two additional recovery gaps despite the
  earlier green suites: a transient unknown iCloud identity did not schedule a
  foreground retry, and invalid current-generation metadata hid an intact previous
  recovery candidate. Both were reproduced before correction. Unknown identity now
  schedules a bounded active retry without switching profiles or publishing before
  confirmation. Recovery offers independently valid references, while publication
  remains strict; damaged data with no valid candidates still fails closed.
  The Standards axis also identified one duplicated payload-comparison helper;
  it now delegates to the existing shared comparison rule. That axis reported no
  hard repository-standard violation.
- After the combined fix, the controller reran 103 TypeScript tests and typechecking
  successfully and inspected the native result bundle: 17 CloudKit tests passed,
  none failed or skipped. Parameterized cases cover missing metadata and mismatched
  hash, revision and date. The updated Release build succeeded. StoreKit sources
  were unchanged after its 12-test regression pass. Final scoped re-review confirmed
  both Spec findings and the Standards suggestion addressed, with no new important
  or critical defect in the fix. Actual Apple service acceptance remains open.

The final report must update these entries with measured results, preserving the
distinction between local verification and real sandbox/CloudKit acceptance.

## Physical sign-in failure investigation — 2026-09-13

- A temporary, allowlisted on-device probe confirmed an available iCloud account
  followed by a CKSyncEngine sign-in event during list retrieval. The delegate
  incorrectly invalidated that fetch as an account replacement. Expo's wrapped
  error then failed the coordinator's exact-message check and appeared as a local
  storage failure. No storage-capacity failure was established by this symptom.
- The delegate now rechecks the selected identity for sign-in without changing
  upload consent or clearing previous failures. Sign-out, account replacement,
  identity mismatch and invalidated operations remain blocked. The coordinator
  accepts allowlisted terminal error codes in Expo cause lines without displaying
  arbitrary native descriptions.
- Before correction, the new initial-sign-in native regression failed and four
  wrapped-error coordinator regressions displayed the wrong storage error. After
  correction, all 107 TypeScript tests, typechecking and 20 native CloudKit tests
  (28 parameter-expanded runs) passed. Temporary diagnostic UI and native probes
  were removed; pre-existing learning data was not reset.
- These automated results alone did not establish real-service acceptance. The
  subsequent physical-device rehearsal below confirms fresh download and isolated
  restore, but does not close ticket #49's clean-install recovery gate.

## Non-destructive recovery rehearsal — passed 2026-09-13

The owner observed backup enabled without an error and confirmed that practice
survives app relaunch. This establishes local durability, not clean-install cloud
recovery. A temporary `[VERIFY-49]` acceptance control was installed to:

1. Capture the currently acknowledged, opted-in profile without modifying it.
2. Use a fresh CloudKit engine and a new temporary cache to read a matching backup
   from the private database. The probe never invokes publication or cloud deletion.
3. Import the downloaded payload with the normal backup-store restore method into
   a private in-memory SQLite connection, then compare its canonical export with
   the captured local records. Reject a changed account/profile/revision.
4. Close the temporary database and remove only the probe-owned cache. Display a
   result without account identifiers, file paths, backup payloads or raw errors.

The owner supplied the phone's successful verification result: the freshly
downloaded backup was restored into empty SQLite and matched the captured current
learning records. Existing records were unchanged. This demonstrates fresh cloud
download and isolated restore, **not** a fresh installation's account selection,
normal UI recovery flow or multi-device merging. No uninstall/reset was performed.
The temporary control and its `[VERIFY-49]` helpers were removed after the result;
the sign-in and wrapped-error fixes and their regression tests remain.

Harness verification: 109 TypeScript tests and typechecking passed. The native
CloudKit suite passed 22 tests (33 parameter-expanded runs), including unchanged
remote records, stale/offline/account failures, scratch cleanup and refusal to
use or remove an existing directory. The signed physical-device build, in-place
installation and launch succeeded. The owner-triggered phone result passed.

## Normal clean-install recovery — baseline matched 2026-09-13

On 2026-09-13 the owner explicitly authorized uninstall/reinstall verification.
Before uninstalling the exact app, the controller stopped it, copied Documents
and Library to a private local safety directory outside the repository, and
preserved the signed installation bundle. All three copied SQLite databases
passed integrity checks. The selected profile's revision and acknowledgement
were both 41, with a validated matching backup asset. The baseline is one
unfinished checkpoint: stage 1, third phrase, one confirmation, listening at
0.843291714 seconds and rate 1. Completion/reward tables are empty; preferences
contain two rows. These counts bound the eventual acceptance claim.

Uninstall succeeded and the target was verified absent. The same signed normal
build was installed afresh without copying the safety snapshot back to the phone.
The owner used the normal Settings recovery action and reported successful
recovery. The controller then stopped the app and copied the restored Documents
and Library separately for read-only comparison. All SQLite integrity checks
passed. Canonical exports of every learning/preference table match the pre-delete
baseline exactly, including checkpoint position, cycle count and playback rate.
Backup remains enabled and the restored installation's revision is acknowledged.

The two choices seen during restoration were the old installation's current and
previous referenced backups (revisions 41 and 40). A subsequent fresh installation
can own an additional writer head; numeric UI labels are not stable backup IDs.
No UI naming change was made as part of this acceptance check.

This verifies the normal clean-install selection and restore of the captured
unfinished checkpoint and preferences. Completed-run, XP and study-day tables
were empty, so nonempty reward-history restoration is not proven by this test.
Resumed playback from the recovered checkpoint and the remaining offline/reward
scenarios still need owner verification. Preserve the safety copy until the
owner approves its removal; never attach its private payload to the issue.

## Singleton backup implementation verification — 2026-09-13

The approved singleton implementation now presents one normal `백업 복구` action
with the last saved date and time. Multiple recovery choices are restricted to an
explicit one-time migration of divergent legacy backups. When both sides changed,
the user chooses cloud or this device with a native confirmation explaining that
records are replaced, not merged. Existing disabled accounts must re-enable backup
before conflict resolution; first-use choices explicitly enable backup and either
import guest records/settings or choose cloud records.

Pure UI-model tests cover singleton recovery, legacy-only choices, fail-closed
unexpected candidates, captured conflict tokens and backup identities, first-use
consent, disabled/busy/unavailable states, empty-cloud local publication, retained
disable controls, and cleanup status. The focused suite passed 9 tests and TypeScript
typechecking passed. The controller's post-coordinator controlled simulator run
passed 29 CloudKit tests (42 parameter-expanded runs), with no failures or skips;
the unchanged StoreKit regression passed 14 tests (16 runs), also with no failures
or skips. These are local/external-boundary results, not evidence of live CloudKit
singleton retention.

Cleanup-pending means the replacement backup can already be acknowledged while
safe retirement remains unfinished. Retry continues known cleanup, but newly
changed legacy heads from an older app can require updating and resolving the
other device. The UI does not claim that cloud retention is already singleton.

After UI review, the controller independently reran all 147 TypeScript tests and
typechecking successfully. The fully bundled Release iPhone build passed with
automatic development signing. Strict code-signature verification passed; the
signed app contains its JavaScript bundle and CloudKit Development, development
push, and development-debugging entitlements. No physical installation or launch
was performed. Existing Expo/React Native/Pods compiler and bundle warnings remain;
the successful build is not a warning-free dependency audit.

The Release simulator build and launch also passed. The controller inspected
Settings: the unavailable iCloud state exposes retry without recovery/import
actions, the card clears the tab bar, and retry returns quietly to the same state.
This confirms the unavailable-state layout, not a live conflict dialog or available
iCloud account; those action models and token bindings have automated coverage.

Remaining acceptance gates are real private-CloudKit verification that cleanup
leaves one shared recovery head and referenced asset, clean-install singleton
recovery with nonempty rewards, and a controlled two-device race/continuation test.
Every active device must use the updated app; the earlier physical recovery above
exercised the old per-writer implementation and does not validate this singleton
behavior. No live cloud records or physical device installation were changed.

### Final integrated cleanup correction

The final review reproduced an uploaded CAS-loser asset remaining after the user
adopted the cloud winner. Cloud adoption now durably captures the exact native
pending identity with the SQLite account base/profile, including when local edits
have advanced beyond the uploaded revision. A separate maintenance call publishes
that asset's exact cleanup authority by head CAS before retiring native pending.
It preserves the chosen progress reference, revision and backup date. Restart
retries the local marker; another installation can resume already-published shared
authority. Failed cleanup keeps adopted local progress usable and remains visible.

Regression verification after this correction: 60 coordinator tests, 154 full
TypeScript tests and typechecking passed. The controlled native suite passed 31
tests / 53 parameter-expanded runs, with no failures or skips. Native mutation
testing confirmed the new lifecycle/safety assertions fail with retirement
disabled (2 failed tests / 11 failed runs); the mutation was removed before the
final green suite. The controller independently repeated all 154 tests/typechecking
and the full 31-test / 53-run native suite on the frozen correction. The fully
bundled, development-signed Release iPhone build and strict code-signature check
passed, including CloudKit Development and development-push entitlements. Release
simulator build/launch and the unavailable-account Settings state also passed.
These remain controlled test results, not live CloudKit or physical acceptance.

### Metadata-only pending retry — reproduced and corrected

The scoped re-review confirmed the original orphan-retirement defect is addressed,
but reproduced an Important interaction introduced by metadata-only head updates:

1. A device stages a normal publication against the current progress token, but
   its head save is interrupted.
2. Another device retires an abandoned upload through metadata-only head CAS.
   The current progress token is unchanged; the CloudKit head change tag changes.
3. The first device retries the same pending publication, including through an
   explicit local-record choice. It reuses the persisted old head change tag and
   repeatedly conflicts, even though its expected progress base is still current.

The reproduction observed three consecutive conflicts with an unchanged base.
An additional local edit currently escapes that matching-pending branch, but this
is not an acceptable recovery contract. No data loss was observed; publication can
remain stalled. Passing existing suites do not cover or negate this finding.

The correction rebuilds the conditional pending head from fresh,
verified metadata when the expected progress base is unchanged, retaining its
pending asset and expected base and carrying forward all new cleanup authority.
A genuine progress-base change still conflicts. Fresh CAS metadata, exact asset
retirement authority and captured legacy-head retirement authority persist in one
local state update; an additional race fails safely and the next retry fetches
again. No caller API, progress revision or account-identity behavior changed.

The owner requested a checkpoint commit before this correction. The regression
test then reproduced three failures (normal retry, restart, a second metadata race),
while its changed-progress rejection passed. After the correction, all 32 native
tests / 57 parameter-expanded runs passed with no failures or skips, including
unchanged-payload retries, pending-asset identity, cleanup authority preservation
and fresh-installation cleanup. All 154 TypeScript tests and typechecking passed.
The fully bundled, development-signed Release iPhone build also passed. This does
not replace the outstanding real CloudKit and physical multi-device acceptance.

### Follow-up review regressions — 2026-09-13

Three additional review findings are corrected with controlled regression tests:

- An edit during a cloud lookup no longer creates a conflict when the adopted
  cloud progress identity is unchanged. Publish the latest local revision using
  the same conditional cloud base; genuine cloud changes still require review.
- Guest settings and selection writes now invalidate in-flight recovery and
  previously displayed conflict consent independently of the SQLite journal
  revision. A new confirmation is required, including after a change-and-revert;
  the original guest data remains separate from the activated account profile.
- If publication committed but its response was lost, metadata-only cleanup by
  another installation no longer prevents acknowledgement on retry or restart.
  Match the committed progress independently of mutable cleanup metadata while
  retaining the fetched head and its cleanup authority. Newer cloud progress
  still rejects the old publication.

Before correction, five coordinator regressions and two native parameter cases
failed with the reported symptoms. After correction, all 161 TypeScript tests,
typechecking, and 33 native tests / 60 parameter-expanded runs passed, with no
test failures or skips. Native tests ran on an iOS 26.5 simulator with only the
external cloud service replaced. No physical-device installation, live iCloud
write, or fresh full-app build was performed for this follow-up; these results
do not establish real-service acceptance.

### Pre-publication review — 2026-09-13

- The compact automatic-backup switch retains explicit first-use guest consent
  through a native alert: include current records, start separately, or cancel.
  Waiting/canceling does not publish or activate an account profile. An account
  generation change invalidates a pending choice; re-enable keeps the existing
  profile without another import prompt.
- Matching-base reconciliation retries acknowledged cleanup even when new local
  progress is pending. This lets a full native cache recover after deletion
  becomes available, without restoring cloud data or discarding local edits.
- Cleanup-manifest encoding and decoding share structural/count validation.
  A direct boundary probe against the previous encoder accepted 257 assets even
  though decoding rejected them. The new encoder rejects these inputs before
  publication. This is defensive format validation: normal publication also has
  a 256-record cache limit, so the review did not establish remote corruption
  through a normal sequence of publications. An initial manifest-only test
  fixture was discarded because absent asset IDs are filtered during fetch.

The real-service acceptance gates above remain open. Local fixture tests and
the prior empty-reward recovery do not prove current singleton clean-install
recovery with completion/XP history.

Fresh integrated verification: 179 TypeScript tests, typechecking, iOS bundling,
34 native CloudKit tests and 14 native StoreKit tests passed with no test failures
or skips. The normal-API capacity probe reached 255 publications with failed
deletion (256 records / 254 cleanup entries): further publication stayed blocked
after deletion recovered until acknowledged cleanup ran. The coordinator
regression now covers retrying cleanup before pending progress is published.
No live-service writes, physical-device reinstall, purchase, or release was used
for these checks.
