# Native cutover acceptance — #99

Status: **local implementation verified; internal TestFlight and owner-reported device checks passed; acceptance remains partial**. The owner confirmed installation of TestFlight **1.0 (5)**, normal hosted-sample acquisition and offline opening, monitoring-only recovery after calls and lock return, and monitor shutdown on leaving learning. Earlier directly installed development-channel acquisition failures remain historical evidence, not failures of the later TestFlight check. Sandbox purchase testing is deferred by the owner; remaining hardware and cloud-service gates below stay open. No cloud-history reset, purchase or public release is claimed.

Initial local candidate `ea22154` has native source tree
`8d638f0cd7b39ceb5f084912bcc0d8827ddd79ec` (2026-09-29). This historical source
precedes later monitoring/recovery and diagnostic changes; it does not identify
the final PR snapshot or TestFlight version. Source identifiers are Git trees
for `native-ios/`, not signed-device builds or release versions. Later local
verification and its source snapshot are recorded in the dated continuations.

Earlier complete native coverage used the guide's complementary CI selections:
`-only-testing:NativeFoundationUITests/PlayerUITests` and
`-skip-testing:NativeFoundationUITests/PlayerUITests`, each serial on an isolated
simulator after StoreKit setup. Neither selection alone is full-suite evidence.
Reproduction commands are in the
[native build guide](../../native-ios/README.md#generate-test-and-build); use the
fictional CI configuration, a dedicated iOS 27 simulator, and the separate StoreKit
setup scheme before the complete main test scheme.

## Baseline, not current acceptance

On 2026-09-29, PR #107 merged into `dev` at `1096342`; its required hosted checks passed. The same tracked tree is present at `5cc59aa`. A fresh package baseline for #99 passed all 337 tests: LearningDomain 53, LearningPersistence 39, LearningReference 18, LearningMedia 49, AppleServices 109, AppFoundation 69.

Previous local iOS 27 evidence passed 96 behavioral tests and one StoreKit setup check. #99 must rerun the final candidate; those earlier counts do not close the new parity audit.

## Local gates

- [x] Resolve or explicitly disposition G1–G5 in the [48-feature matrix](cutover-matrix.md).
- [x] Focused repeated runtime/reference/service teardown tests preserve durable progress and reject obsolete work.
- [x] Focused normal installed-learning journey survives unavailable services and relaunch without new credit.
- [x] Long price, largest text, light/dark, Reduce Motion, touch targets and hidden-text boundaries checked locally.
- [x] Final six-package suite and complete iOS 27 coverage pass with zero failed/skipped tests across the two complementary CI selections.
- [x] Debug/Release built products pass the no-JavaScript/runtime, content, entitlement and test-bypass guards.
- [x] Independent Standards and Spec reviews complete; actionable findings resolved.

## Focused local evidence — 2026-09-29

- Runtime/reference/service tests cover three consecutive reentries, an obsolete dictionary response, and stale destructive confirmations. The strengthened runtime case starts with a nonzero confirmed checkpoint and compares its source progress, selected unit, run identity and XP after each teardown.
- The checkpoint case exposed a real preparation-boundary bug: pausing a retired driver could copy its prior cycle position into the next cycle. Position capture now requires the matching prepared transport token. The deterministic coordinator regression failed before the fix; all 16 coordinator cases and all 8 native lifecycle cases then passed.
- Paid-card metadata, a long local StoreKit price (`$99,999,999.99`) at the largest text size, accountless relaunch, reward expiry/relaunch, and isolated diagnostic controls passed focused UI checks. No purchase was performed by the price journey.
- Reward review exposed incorrect attribution of imported XP. Real SQLite tests imported 3 XP before a 1-XP command, reproduced an incorrect 4-XP receipt, and now require exactly 1 XP for both direct success and lost-reply recovery. Seven committed-feedback tests passed.
- A nine-case UI selection passed with simulator Reduce Motion enabled. A follow-up normal local/cloud/download confirmation journey passed in light and dark appearance at the largest Dynamic Type size. Native alert messages scroll at this size, and actions remain reachable. Cloud confirmation uses a UUID-scoped controlled external transport, never a real account. The test initially overscrolled a row behind the fixed header; bounded viewport scrolling corrected the test without changing production alerts. Original Reduce Motion and related animation preferences were restored and verified afterward.
- The final package run passed all 341 tests: LearningDomain 53, LearningPersistence 39, LearningReference 18, LearningMedia 50, AppleServices 109, AppFoundation 72. Dedicated iOS 27 simulators passed the separate StoreKit setup check. Final native results cover all 104 cases: the player selection passed 19, and the remaining selection passed 85 (29 UI, 37 media/reference, 19 StoreKit). Each finalized result reports zero failed and zero skipped tests. These are local results, not a hosted CI result.
- The first full native run completed 104 cases: 103 passed, one failed, none skipped. The restore test failed in fixture setup, waiting for cached entitlement propagation before the app's restore action could execute. A diagnostic run passed, showing the propagation failure was intermittent. The corrected test verifies the fixture's exact purchased transaction before executing real `AppStore.sync()`, retaining all restored-ownership and network-failure assertions. Its full 19-case StoreKit target passed; no retry was added to the app or test. The original failed run remains recorded, not reclassified as successful.
- A concurrent local UI-selection attempt hit a Settings-tab hittability failure and was interrupted. A focused diagnostic run passed; the precise transient cause remains unproven. Failure-only screenshots and hierarchy attachments were added without increasing the deadline, retrying the action, or changing the assertion. The player selection then finalized with 19 passes and no failures/skips. The remaining selection ran afterward without concurrent UI automation and passed all 85 cases; the earlier failed/interrupted result remains excluded from acceptance.
- The clean-copy Debug/Release configuration check, service mapper self-test, fictional downloader build, local-video boundary self-test, actionlint and diff checks passed without private identity files. Both Debug and Release compiled and passed the complete built-product guard: iOS 26.0 minimum, compiled primary icon, unchanged sample/launch assets, no excluded runtimes, exact configured entitlements, and no Release test bypasses.
- The owner approved resizing the original opaque 1254×1254 icon with macOS tools. A separate 1024×1024 AppIcon preserves the artwork and has no alpha channel; the source image remains unchanged. This resolves the earlier `Missing compiled primary app icon` failure. The icon-enabled Debug product was installed and launched on the dedicated simulator.
- Independent Standards and Spec reviews found five actionable issues in the initial candidate; all were fixed and regression-tested. Both axes reported zero remaining actionable findings in the updated candidate and its UI/icon addenda. This is a code review, not device or live-service acceptance.

## Hardware gate — #103

The owner previously verified launch/loading haptics on the W4 build. On 2026-09-30,
the owner reported normal learning haptics, headset-button dispatch, safe monitor
shutdown on unplugging, and paused learning after calls/Siri/lock on `ea22154`.
Wired Apple-earphone monitoring became audible after remote viewing/debugging
was removed, without a product or gain change. Treat that as an environment-bound
observation, not a proven code defect or a fully isolated OS diagnosis.

Remaining checks include precise cycle/Repeat and duplicate-credit cases,
permission and built-in-mic fallback, gain isolation, unsupported routes and
completion cleanup. The owner subsequently confirmed call and lock-return
monitoring-only recovery and exit cleanup on TestFlight 1.0 (5), as recorded below.
Learning remains manual Resume. Separate owner observations from automated edge
coverage; exit cleanup does not prove completion cleanup.

Manual VoiceOver is excluded by owner decision, not reported as passed. Simulator observations do not prove tactile timing, real calls, physical microphone routing or headset dispatch.

## Monitoring recovery continuation — 2026-09-30

The owner approved monitoring-only automatic recovery, then approved an in-place
installation after regression verification. The scoped source patch has SHA-256
`1a0eb49c9a76848e8c3a3dc03673adada58413e66d38cccb7e3e25f52d26bcd6`.
This identifies an uncommitted patch, not a release version or Git commit.

- Established ON intent survives an audio-session interruption. Recovery requires
  a system-permitted interruption end, granted microphone permission, the wired
  headphone route, an eligible foreground lesson and a closed menu. Learning
  still requires explicit Resume and receives no credit from recovery.
- Manual OFF, unplugging, lost access, completion and exit cancel recovery.
  Media-services reset remains manual. The OFF command commits synchronously,
  preventing a queued tap from enabling the monitor after an interruption ends.
- Fresh package verification passed all 355 tests: Domain 53, Persistence 39,
  Foundation 72, Reference 18, AppleServices 109 and Media 64. The complete
  iOS 27 scheme passed all 105 tests, with zero failures and zero skips: 48 UI,
  38 media/reference and 19 local StoreKit cases. The separate StoreKit setup
  passed beforehand. These are local results, not hosted CI or live-service tests.
- The signed physical Debug product passed the complete native-product guard and
  deep/strict signature verification. Its exact reviewed patch was rechecked
  before installation. In-place installation and normal unattached launch both
  succeeded on the approved phone. No remote screen viewing or debugger was
  connected for the requested audible recovery check.
- Subsequent Release verification on the unchanged reviewed patch passed the
  iOS 27 simulator build and complete Release product guard, including the
  exclusion of Debug test bypasses. AppleServices was rerun and passed all 109
  tests. This is not a distribution-signed archive, TestFlight upload or new
  physical installation. No further implementation defect was established by
  this continuation; the pending live-service checks still need their approved
  environments and operation scopes.
- Pre-update and post-update workspace copies passed SQLite integrity checks.
  Checkpoints, commands, completions, historical awards, preferences, reward runs
  and study days matched across both profiles: 14 unchanged table comparisons.
  These copies do not prove future restoration or downgrade compatibility.
- The owner confirmed on the new installed build that microphone monitoring
  recovered after Siri ended and the app returned, while learning stayed paused.
  Real calls, lock/background recovery, unsupported routes, permission/gain edges
  and completion cleanup remain separate checks; they are not promoted from
  automated tests to physical acceptance.

The earlier full-suite tool timeout was deliberately interrupted because its
snapshot preceded the final OFF-command fix. It is excluded from acceptance;
the final complete terminal run above succeeded without filtering or retries.

## Live Apple-service gate — carried from #98

Apple-hosted delivery needs a supported test channel: Apple's documentation
describes TestFlight/App Store distribution, or a local Background Assets mock
server with development overrides before distribution. The current directly
installed development app is not evidence of TestFlight-hosted availability.
This is a missing test-environment prerequisite, not an established explanation
of the earlier opaque download failure. Retain that failed observation until a
supported-channel test and the underlying service error establish the cause.
The owner subsequently authorized the verified Swift build's internal TestFlight
upload and distribution to existing internal groups. Device development overrides,
external testing, App Review submission and public release remain unauthorized.
See [Apple's hosted-asset overview](https://developer.apple.com/help/app-store-connect/manage-asset-packs/overview-of-apple-hosted-asset-packs/)
and [local testing guidance](https://developer.apple.com/videos/play/wwdc2025/325/).

- Real sandbox purchase, restore, pending, cancellation, declined approval and paid-content acceptance are deferred to [#108](https://github.com/codeyoma/meta-shadowing/issues/108) by the owner's 2026-09-30 scope amendment. This is removed from the immediate #99 acceptance pass, not marked passed.
- [x] Normal real Apple-hosted sample acquisition, installation and offline opening on TestFlight 1.0 (5) — owner-reported.
- [x] Real Apple-hosted download cancellation and retry — owner-reported after the scoped reset/retry approval request. The agent's controlled lab is separate evidence, not an agent-observed live transfer interruption.
- [ ] Real Apple-hosted acquisition recovery after a system interruption.
- [x] Single-device Development CloudKit one-time reconciliation, acknowledged local revision and repeated-sync deduplication, with automatic sync remaining disabled.
- [ ] Private CloudKit Development account switching, permission/quota failures and offline recovery.
- [x] Sequential physical two-device Production recovery and repeated-sync deduplication, including an initially empty account profile; see the approved Production verification below. Concurrent/offline-divergent live merges are not covered by this pass.
- [x] Scoped iPad-local history reset and recovery — owner-reported; no real cloud-history deletion is established.
- [ ] Separately authorized real cloud-history reset and stale-client resurrection checks.

No login or live service is needed for local StoreKit fixtures. These live journeys require separately designated accounts/configuration and operation scope. Missing prerequisites remain blockers, never fixture passes.

## Replacement gate

- [x] Identify the exact designated installation and candidate build privately.
- [x] Preserve recoverable reference source and binary with local checksums.
- [x] Obtain immediate owner approval of the installation and reset scope; default is no uninstall or deletion.
- [x] Install only the approved signed candidate.
- [ ] Finish representative normal offline/hardware/recovery journeys; successful UI checks alone do not close this gate.

Retaining an old binary does not promise recovery of new Swift progress or downgrade-data compatibility. The later internal TestFlight approval is recorded below. Public release, production schema change, identity registration and reference-source deletion remain outside the approved scope.

## Authorized internal TestFlight upload — 2026-09-30

The owner explicitly approved uploading the verified Swift build and distributing
it to the existing internal testing groups. Version **1.0 (5)** was accepted by
Apple's upload service, completed processing, and now reports **Testing** with
both existing internal groups assigned. At upload completion, the physical phone
had not been replaced again. The subsequent owner-reported installation and
download journey are recorded separately below, not inferred from upload success.

- Existing signing identities and cached profiles were reused without identity
  registration, provisioning-update flags, agreement acceptance or schema deployment.
  Export and upload use the internal-only restriction. CloudKit signing and app
  metadata use Production consistently; no Production sync or reset was executed.
- The first manual-signing attempt rejected Xcode-managed profiles. An unsigned
  export lost service entitlements and failed the product guard; it was not uploaded.
  A normally signed archive preserved the required capabilities through export.
- The guard initially rejected Apple's `beta-reports-active` distribution identity
  flag. Regression tests failed before the narrow correction: only true with an
  explicit non-debuggable signature is accepted. Extra service capabilities,
  malformed flags and debuggable beta products are still rejected.
- Export compliance initially prevented testing. Source inspection found Apple's
  SHA-256 and Apple-provided services, with no custom encryption implementation.
  The technical classification selecting none of the listed non-OS algorithms
  was saved. The build then became Ready to Test and was assigned to the existing
  Controlled Sample and Controlled Sample Auto groups. No tester was added, no
  paid agreement was accepted, and no external review or release was submitted.
- Apple rejected build 4 for a missing downloader display name and an unintended
  iPad device family. Configuration and built-product regressions reproduced both
  defects. The app and downloader now explicitly target iPhone; the downloader
  has a nonempty display name. This does not introduce iPad-native support.
- Build 5's exported IPA passed deep/strict signature verification and the complete
  Release product guard. After the packaging fixes, all 355 package tests, mapper
  self-tests, clean-copy Debug/Release configuration checks, Debug/Release CI builds
  and built-product guards passed. Shellcheck and diff checks passed. Earlier
  105-case native results are not presented as a new run after these metadata fixes.

Upload success is not real hosted acquisition, sandbox purchase, Production
CloudKit recovery, physical-device acceptance or #99 completion. Raw signing,
upload and recovery artifacts remain private. Changes remain uncommitted.

## Owner-reported TestFlight acceptance — 2026-09-30

The owner confirmed completion of items 1 and 2 in the requested device checklist:

- TestFlight **1.0 (5)** was installed; the Apple-hosted Morning Notes sample
  downloaded and opened offline. This is the hosted sample, not the bundled book.
- After a phone call and after screen-lock return, previously enabled microphone
  monitoring recovered while learning playback stayed paused for explicit Resume.
- Leaving the learning screen stopped microphone monitoring.

These are owner-observed physical checks, not instrumented results. They do not
prove interrupted/cancelled download recovery, every headset or microphone route,
completion cleanup, purchases, Production CloudKit or two-device convergence.
The earlier Siri, basic haptic and headset observations remain separate evidence.

The owner deferred item 3 (account preparation and live sandbox purchase tests)
until their business setup is ready. This records the owner's timing decision,
not a finding that business registration is universally required for sandbox
testing. No sandbox login, purchase, agreement acceptance, account switch, sync
enablement or reset was requested or performed by this continuation. TestFlight
uses Production CloudKit; the earlier Development backup pass does not establish
Production readiness. #99 remains partially accepted.

## Recovery and reset verification continuation — 2026-09-30

The owner requested the remaining checks that can run now, while deferring live
sandbox purchase testing. The connected phone's existing downloads and learning
history were preserved. Airplane Mode was already enabled and was not changed;
the physical iPad was unavailable. No live cloud operation or reset was performed.

- All six package suites passed: Domain 53, Persistence 39, Reference 18, Media
  64, Foundation 72 and AppleServices 111, for **357 tests**. Existing delivery
  coverage proves that cancellation rejects a late installation and explicit
  retry succeeds through a controlled external transport. This is not live
  Apple-hosted cancellation evidence.
- Two new coordinator integration cases use separate real SQLite installations
  and caches with the controlled cloud-service boundary. One restores a fresh
  installation, unions independent 3-XP contributions, then cold-restarts and
  repeats reconciliation without increasing the resulting 6 XP. The other keeps
  an offline stale installation while the first resets, then cold-restarts the
  stale installation and verifies that old credit is not resurrected, separate
  guest history is preserved and new same-generation learning survives.
  Automatic sync remains disabled. These are two-client fixture results, not
  physical iPhone/iPad or Production CloudKit acceptance.
- The first new recovery-test attempt incorrectly read the guest profile before
  the explicit one-shot account activation. Its four failed assertions remain
  recorded privately. Correcting the test's consent/setup order passed without
  a production change. The existing account-reconnect fixture also emitted its
  pre-existing `online` capture warning; this run is not described as warning-free.
- The existing seven service UI cases passed on the dedicated iOS 27 simulator,
  with zero failures/skips. A new isolated local-reset UI case also passed with
  zero failures/skips: confirm one practice cycle, acquire the fixture book,
  delete only the disposable local history through the normal confirmation,
  relaunch, retain downloaded availability, keep XP at zero and sync disabled,
  and reopen the first stage with no retained confirmed cycles. This executed
  the reset, unlike the earlier confirmation-and-cancel checks. These eight
  selected UI cases are not a new complete native-suite run.
- On the installed phone, attempting the undownloaded internal free book while
  offline presented a failure state with an explicit retry control. The bundled
  and previously downloaded sample cards remained available. No active download
  cancellation or successful retry is claimed from this observation. A temporary
  network change was requested but not performed without the owner's response.

Only tests and acceptance records changed in this continuation. The new tests
use the approved coordinator/store and normal-app-UI seams; no production test
API or runtime change was added. Live cancellation/interruption/retry, physical
two-device recovery, Production CloudKit readiness and separately scoped
disposable live reset trials remain open. Purchase testing remains deferred.
No commit, push, new upload or issue closure occurred.

## Connected iPad and Production sync trial — 2026-09-30

The owner approved TestFlight/native 1.0 (5) installation on the connected iPad
and explicit one-time Production sync on both devices, confirming the same
existing iCloud account. Guest-history import, automatic sync, purchases, account
changes and resets were excluded. Native 1.0 (5) was installed on the iPad and
verified on both devices. TestFlight reported iPad compatibility; the iPhone-first
app opened in an upright compatibility window with Books and Settings reachable.

The iPad recognized the current iCloud account and retained automatic sync OFF.
Its confirmed one-time sync failed; one focused retry also failed. A scoped,
temporary Console capture showed `CKErrorDomain Code=2` during sending. The
matching Production service log reported a private `LearningProgress` record save
from iPad with `USER_ERROR` / `BAD_REQUEST`. Request/account identifiers are not
included here. Streaming was stopped after the capture.

Read-only CloudKit Console inspection initially found only `Users` in Production. Development
contained `ProgressBackup` and `ProgressBackupHead`, but neither type then had
the optional String `resetGeneration` field used by the Swift adapter. This is a
confirmed schema-readiness blocker; the aggregate error does not expose each
record's underlying error. The schema deployment preview was inspected and
cancelled without deployment. Its existing default role/index changes also need
review before promotion. No records, roles, fields, indexes or schema were edited.

At this trial, physical two-device convergence remained unaccepted. Production schema preparation
and deployment required separate owner approval before another live sync trial.
Local history was not reset, guest history was not imported, automatic sync stayed
off, and no account or network setting was changed. Live purchases are tracked in
[#108](https://github.com/codeyoma/meta-shadowing/issues/108), not marked passed.

## Approved Production schema and two-device verification — 2026-09-30

The owner subsequently approved preparing the missing fields and deploying the
reviewed CloudKit schema to Production, without copying or deleting existing
records. Both application record types received the optional String
`resetGeneration` field in Development, without new field indexes. An early
stale deployment preview was cancelled; the refreshed final diff contained both
fields. It created only the two application types, preserved their 45 existing
indexes and default type-role grants, and left `Users` unchanged. No container
access, custom roles, sharing or public records were added. The native adapter
continues to use only the private database.

CloudKit Console reported that the schema was deployed to Production. Both
Production type pages subsequently showed the String field. The iPad's next
explicit one-time sync cleared the earlier failure; the matching private record
save reported `SUCCESS`. Raw service logs and deployment screenshots remain
private. No app upload, public release, record migration or reset occurred.

Normal TestFlight 1.0 (5) UI on the physical iPhone and iPad then verified:

- Explicit account-profile recovery with automatic sync OFF. The fresh Production
  account profile was used without importing the separate guest history.
- One real Stage 1 practice cycle explicitly confirmed on the phone, then
  restored on the iPad with its confirmed-cycle checkpoint and resume position.
  Recovery and opening the stage did not grant an additional reward.
- One further real resumed cycle explicitly confirmed on the iPad, then restored
  on the phone. The exact combined test credit was retained after another sync
  without new practice; neither repeated recovery nor cold relaunch on either
  device duplicated it. Relaunch did not automatically open or play a lesson.
- Representative preference recovery: the iPad's source-text size was temporarily
  changed from 20 to 21 and recovered on the phone. It was then restored to 20
  on the phone, published once and recovered on the iPad. Both devices finished
  at source size 20, translation size 18 and System fonts. No reset control was
  used, and automatic sync remained OFF on both devices.

This accepts sequential physical progress/checkpoint and representative-setting
recovery, including the initially empty account profile. It does not establish
every setting, simultaneous or offline-divergent live merge, account switching,
quota/permission failures or stale-client behavior after a real cloud reset.
Live hosted cancellation/retry and separately authorized disposable reset checks
remain open. Purchases remain deferred to #108; #99 is not closed by this pass.

## Live cancellation and reset preparation — 2026-09-30

The owner requested the remaining real download cancellation/retry and reset
checks. On the physical iPad's normal TestFlight 1.0 (5) UI, the hosted Morning
Notes sample moved from Download through visible 0% progress to an installed
card with Play and management controls. The attempted cancellation occurred
after acquisition had already completed and opened the stage list instead;
this is not accepted as a cancellation or retry pass. No practice was confirmed.

The undownloaded internal free DUO entry immediately reached a failure state.
Its cause was not diagnosed in this attempt. Existing bundled and hosted-sample
availability remained intact, and the account profile still displayed the prior
test credit. No network, account, purchase or automatic-sync setting changed.

Separate approval was requested to remove only the newly acquired iPad hosted
sample for a fresh cancellation/retry attempt, and to delete only the iPad's
current account-profile local history before cold-relaunch and cloud recovery.
The normal local-history confirmation was opened, but its destructive action
was not executed. Cloud-history deletion requires a separate immediate scope
confirmation. Neither reset nor cancellation/retry is marked passed here.

## Owner-reported cancellation and local reset — 2026-09-30

After the separate cancellation/retry and local-reset approval request, the
owner reported that both checks worked. This is owner-reported physical-device
acceptance, not an agent-observed interrupted Apple-hosted transfer. The agent's
earlier completed-before-cancel attempt remains recorded above; it is not
retrospectively promoted to a pass. No real cloud-history deletion or stale-client
recovery after cloud reset is established by this report.

The owner additionally authorized an isolated internal slow-transfer and recovery
tool so the agent can exercise cancellation, retry and local reset deterministically.
Its synthetic transfer/local backup evidence must remain separate from live
Apple-hosted delivery and Production CloudKit evidence.

## Debug download and local recovery lab — 2026-09-30

The approved Debug-only tool is available through Settings, Developer Tools,
then **다운로드·복원 검증**. Its transfer runs for approximately ten seconds and
supports pause/resume, explicit failure injection, cancellation and retry.
The transfer source is controlled; `ContentDelivery` still checks real bytes,
hashes and the manifest before atomic installation. SQLite owns the diagnostic
history, and local reset uses the normal service coordinator. A separate local
backup supports recovery after reset and process relaunch. All data uses an
isolated UUID namespace. It does not operate on real cloud history or purchases.

Regression tests first reproduced three defects: an unexpected failure could be
reported as an injected-failure pass, immediate cancellation could miss its
transfer, and close/reopen could overlap ownership cleanup. Cancellation and
teardown are now serialized and drained. A separate real-package regression
also reproduced a cancelled caller publishing a new transfer; `PackageDownload`
now checks cancellation before creating the independently owned transfer.
Unexpected failures remain failures, not successful test results.

The four visible lab UI cases passed on the dedicated iOS 27 simulator: active
cancellation and explicit retry with verified installation, failure while paused
and explicit retry, local reset/recovery with process relaunch, and the normal
developer entry leaving product history unchanged. The six-package verification
passed 358 cases: Domain 53, Persistence 39, Reference 18, Media 64, Foundation 72,
and AppleServices 112. Debug and Release products passed the complete product
guard; the lab and its launch argument are excluded from Release/TestFlight.
Independent source review reported no remaining Critical or Important findings.

The focused lab integration rerun passed eight cases, but its UI runner failed
to initialize with `Timed out waiting for AX loaded notification`; that result
is not a UI pass. Opening the dedicated simulator frontend allowed the later
UI run to start. The final complete native scheme passed all 118 cases: 53 UI,
46 media/reference integration and 19 local StoreKit cases, with zero failures
and zero skips. The separate StoreKit setup check passed beforehand. The final
lab integration suite includes all eight regressions and recovery cases. These
are local results, not hosted CI or real-service results.

The full test-tool response exceeded its 300-second deadline, but Xcode continued
the same run. Its original completed result bundle reports `Passed`, and its
original log reports `TEST EXECUTE SUCCEEDED`; no duplicate suite was launched.
That complete 118-case run predates the final PR review's graph-recovery fix.
Its source snapshot is recorded in the PR preparation continuation below; it is
not substituted for final verification after that fix.

Four nonfatal `Invalid frame dimension (negative or non-finite).` warnings arose
while entering the existing reveal-WPM fields, not in the new lab. Those warnings
remain recorded and are not represented as fixed by this scoped change.

Direct simulator UI operation also verified a paused transfer staying unchanged,
explicit resume to verified installation, cancellation while paused without an
installation, and explicit retry to verified installation. Reset changed the
synthetic credit from 3 to 0 while preserving the download and local backup;
two recoveries retained exactly 3, its checkpoint and the installation. The
separate-connection reopen action displayed its verification pass. An initial
manual pause attempt occurred after installation completed and is not counted
as a pause or cancellation pass. Only the later controlled attempt is accepted.

No physical installation, upload, purchase, real cloud reset, commit, push or
issue closure occurred for this lab. Controlled local recovery does not satisfy
live Apple-hosted cancellation or Production CloudKit reset acceptance.

## PR preparation and reviewed source — 2026-09-30

The complete 118-case simulator run and 358-case package run above verified native
source tree `5a794cc806184624bf92ae908e035d0599f5e028`, not the earlier installed
`ea22154` source. The initial PR review then reproduced one recovery-authorization
gap: graph invalidation could abort a permitted monitoring recovery attempt, yet
another context update could restart capture without manual action. A focused
regression failed before the fix. The fix consumes that recovery authorization
outside an active interruption; it preserves the established ON intent for a
later system interruption and allows explicit manual restart.

Three focused graph tests passed after the fix, including the new aborted-recovery
regression and waiting-recovery case. All six package suites then passed 360
tests: Domain 53, Persistence 39, Reference 18, Media 66, Foundation 72 and
AppleServices 112. The complete native rerun exposed two Settings taps before
tab readiness after launch or relaunch. Both tests now assert that Settings is
hittable before tapping, using the established readiness pattern. The original
reset, isolation and sync assertions are unchanged. Both focused UI tests passed
with zero failures or skips. The interrupted discovery run is not counted as
complete coverage.

The final reviewed native source tree is
`a6b6d529808b4bf104c7123147454626fbff8fd6`. The complete, unfiltered native scheme
passed all 118 cases against that source: 53 UI, 46 media/reference integration
and 19 local StoreKit cases, with zero failures or skips. Parameterized Swift
Testing cases have additional invocations; the finalized result's total-case
count is 118. The separate StoreKit fixture setup also passed its one case.
Four existing nonfatal `Invalid frame dimension (negative or non-finite).`
warnings remain in the reveal-WPM fields; they are not hidden or counted as
failures. These are local results, not hosted CI or live purchase acceptance.
The readiness-only test changes leave the verified package and built-product
sources unchanged. Debug and Release
simulator builds passed the native-product guard. CI configuration generation
and the service mapper self-test also passed. The previously
installed TestFlight build is not claimed to contain this additional edge fix.
The refreshed feature matrix distinguishes earlier development-channel failures,
later TestFlight owner observations, observed two-device Production recovery and
still-unperformed live gates. No fixture result replaces a real-service check.

## Device preparation — 2026-09-30

- The direct development-device channel successfully queried the designated iOS 27 iPhone and its existing native installation. Xcode's earlier offline listing did not prevent that query. Installation identity and container locations remain private.
- Candidate commit `ea22154` built successfully for physical iOS with existing local signing authority, without provisioning updates or identity registration. Its identity matches the installed app. The signed Debug product and embedded downloader passed signature verification and the complete native-product guard, including the iOS 26.0 minimum, compiled icon, original launch assets, excluded-runtime checks and configured entitlement checks.
- Existing reference service metadata was mapped into ignored native configuration. The candidate uses Development CloudKit and existing internal free/sample delivery; paid hosted delivery is not configured. This build is not evidence of a purchase, hosted acquisition or cloud operation.
- The retained Expo reference binary was copied locally and its complete signature verified. Its executable and the signed candidate have local SHA-256 checksums. Reference source remains in Git at `f146918`; no reference source or authoring tool was removed.
- The current phone's native workspace was copied locally before any replacement. Its learning store passed SQLite integrity checking. This copy does not establish downgrade compatibility or guarantee a future restoration process.
- The owner approved the exact in-place update and device tests. Installation and normal launch succeeded. There was no uninstall, data reset, iCloud account switch, purchase or automatic sync enablement. The final signed candidate's executable checksum is retained locally.
- The initial App Store Connect connection timed out twice. A subsequent read-only refresh succeeded through the existing authenticated browser on September 30. TestFlight lists existing version 0.1.0 builds 1–3, uploaded September 13–14; no new Swift candidate is present. The sample and diagnostic asset packs report ready for internal testing. The existing non-consumable product is in Prepare for Submission. The Paid Apps Agreement reports Pending User Info, with missing tax information. Agreement and tax completion require the owner; the product's submission status alone is not evidence that sandbox testing is unavailable. No agreement, tester, product, content upload or distribution state was changed.

## Representative physical-device evidence — 2026-09-30

These checks used the normal installed app through the physical iPhone screen in Device Hub, not simulator fixtures or Debug probe arguments. Device accessibility text was not available through that surface; observations used rendered controls. Manual VoiceOver remained excluded.

- Books, Stages and Settings navigation worked. Bundled and hosted-sample cards plus the existing internal free listing rendered their distinct metadata. The complete sixteen-stage list remained reachable.
- Normal subtitled Stage 1, first-word Stage 5, grouped first-word Stage 10, and speaking Stages 11, 13 and 15 opened. The speaking stages rendered their respective target-first, translation-first and translation-only arrangements. This is representative UI evidence, not proof of every stage's complete lesson or audible quality.
- One eligible Stage 15 confirmation advanced to the next source and emitted its committed XP receipt. Terminating and relaunching preserved the confirmed checkpoint and credit without opening a player automatically. No other observed reentry, option change or sentence selection was counted as completion.
- A font-size change persisted across process termination/relaunch. The original guest preference was restored through the UI. The attempted speed-slider interaction did not demonstrate a changed value and is not counted as a saved-speed pass.
- Grouped playback returned from a real Home/foreground transition with an explicit Resume action and retained its current unit. The authorized full-sentence reference then selected a different group while remaining paused; no credit was awarded for navigation.
- Tapping a currently visible English word presented Apple's dictionary with installed definitions. Dismissal returned to the normal player. This does not verify syntax analysis: the bundled book has no syntax, and hosted acquisition failed.
- Data Management showed distinct local-history and iCloud-history deletion actions and separately described download removal. No destructive action was executed.
- Under the owner's existing current-account backup authorization, explicit one-time Development CloudKit sync recovered existing account history into its separate native profile. SQLite evidence showed a nonempty cloud base token and an acknowledged local revision. A second sync preserved exact reward, completion and historical-award rows. Both profiles passed integrity checks; guest practice credit remained separate and automatic sync stayed disabled. The selected account profile and recovered history survived a subsequent normal relaunch. This is single-device live evidence, not account switching, two-device convergence or reset acceptance.
- The existing hosted sample acquisition returned the app's download failure state. A fresh-process diagnostic attempt reproduced it; console capture exposed no Background Assets error domain/code, so the cause is not established. Bundled learning remained usable and learning records were preserved. Acquisition, cancellation/retry recovery, verified installation and physical offline use are not passed. No paid delivery configuration or real paid package is present in this candidate.
- Hardware observation was requested from the owner. Learning/Repeat haptics, wired routing/gain, microphone permission, headset actions, unplugging, calls/Siri, lock behavior and completion cleanup remain pending. Device UI observations do not prove these physical effects.

No executable source changed during these checks. The accepted local suites remain the 341 package and 104 native cases recorded above; they were not rerun or reclassified as hosted CI. Public evidence omits identifiers, private history totals, raw payloads and local backup locations.
