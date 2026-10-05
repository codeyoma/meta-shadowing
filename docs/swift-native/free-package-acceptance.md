# Free learning packages — #108

Owner direction and design approved on 2026-10-01. Refs #108. Refs #91.

Current follow-up status, 2026-10-05: the remaining purchase-related copy is
removed, TestFlight 1.0 (9) delivery and in-place retention are verified, and
repeatable controlled-offline acceptance is implemented. The dated sections
below preserve earlier failures and outstanding gates at each checkpoint;
they are not the current verdict. The follow-up still needs its own required
hosted checks and merge into `dev` before manual issue closure.

## Implemented boundary

The active Swift product offers configured packages as explicit free downloads.
Purchase/price/ownership/restoration UI, StoreKit observers, product queries,
transaction operations and paid leases are removed. Native purchase fixtures and
their setup/integration targets are retired; the complete non-commerce scheme
retains its UI and media/reference/download integration targets. Required CI job
names, complementary shards, failure checks and release approval remain intact.

Legacy delivery keys remain compatibility inputs without product identifiers;
package keys, manifest versions, pinned fingerprints and learning identities do
not change. Internal-content restrictions remain. Apple-hosted delivery, validated
atomic installation, cancellation/explicit retry, offline installed learning and
optional private CloudKit recovery retain their existing boundaries.

No Expo source, SQLite schema, account configuration, hosted content or App Store
Connect product is deleted. Source removal is recoverable from Git history.
There is no advertising integration or automatic future purchase activation.

## Initial local test evidence — 2026-10-01

- Configuration regression failed with `invalidContent` when a valid legacy DUO
  package lacked a product identifier, then passed after that prerequisite was
  removed. Both internal flags, manifest mismatch, duplicate assets and unknown
  keys remain covered. The mapper self-test failed on emitted purchase metadata,
  then passed with purchase metadata omitted and service entitlements unchanged.
- Free delivery regression failed with `unauthorized` before paid gates were
  removed, then passed through the public delivery API and real filesystem.
  Late cancellation cannot publish; explicit retry and corrupt-content recovery
  preserve sibling installations. Existing path, immutable identity, publication
  out-of-space/no-permission and staging cleanup tests remain covered.
  An additional public-boundary test cancels during the final source read after
  transfer returns. It fails when final cancellation checks are removed and
  passes with the unchanged checks restored; no ready installation remains and
  explicit retry succeeds.
- The normal UI regression failed while purchase restoration was visible, then
  passed on iOS 27 after its removal. Free download enables stage selection and
  leaves XP unchanged; iCloud and data-management navigation remain distinct.
  The downloaded-lesson relaunch journey retains two confirmed cycles, total
  3 XP across the two separate books and a saved three-source grouping preference.
  Reopening the wrong bundled checkpoint fails the stronger assertion; reopening
  the downloaded checkpoint passes. Explicit local reset remains a separate action.
- Reopening installed content without a transport uses real SQLite and catalog
  interfaces. The confirmed cycle, 1 XP and saved 1.5× preference remain; reopening
  and idempotent download neither confirm practice nor award additional XP.
- All six package suites pass: LearningDomain 53, LearningPersistence 39,
  AppFoundation 77, LearningMedia 69, LearningReference 18 and AppleServices 108
  reported tests (364 total). Parameterized cases are covered by their suites.
- Clean-checkout CI configuration requires exactly both complete serial test
  targets and no purchase setup/framework. Its regression failed before removal
  and passes afterward. The build-progress regression retains safe output and
  compiler failure propagation with the one remaining complete build command.
  The fictional downloader build and actionlint pass without account access.

Fresh unsigned Debug and Release builds pass the native-product guard. The mapper,
video-copy boundary, clean CI configuration, fictional downloader, build-progress
privacy/failure propagation, branch-policy tests and actionlint pass.

Independent Standards review reports zero hard violations and zero actionable
smells. Spec review reports zero implementation defects and two verification gaps:
post-transfer cancellation and downloaded-lesson UI recovery/preferences. Both
are covered by the additional red/green checks above. No production correction
was needed for these gaps, and the final full package suites pass.

The complete unfiltered iOS 27 simulator scheme passes: 106 tests, 106 passed,
zero failed and zero skipped, as verified from the finalized XCTest result.
This includes 53 UI tests and 53 native media/lifecycle tests. Its earlier candidate
was interrupted to incorporate review coverage fixes and is not counted as a pass.

The run includes non-fatal Apple simulator diagnostics for debugger metadata,
dictionary assets and deprecated UIKit status-bar behavior. Local package builds
also retain an existing test-only concurrency capture warning. These diagnostics
are not suppressed, and this record does not claim warning-free execution.

## Initial acceptance checkpoint — 2026-10-01

- The original implementation was merged into `dev` in
  [PR #111](https://github.com/codeyoma/meta-shadowing/pull/111).
  [Hosted run 36838755536](https://github.com/codeyoma/meta-shadowing/actions/runs/36838755536)
  passed all required checks, including the complete 19-test player shard and
  complementary 87-test shard. This does not verify the later local follow-up.
- At this checkpoint, live Apple-hosted free-package delivery still required
  acceptance of the updated signed build. The initial signed-device/copy
  follow-up distinguished controlled transfers from this outstanding gate.
- No uninstall, account switch, purchase, cloud sync/reset, content upload,
  TestFlight upload or public release occurred in the initial October 1
  follow-up. The later authorized distribution and device results are recorded
  separately in the October 5 sections.
- #108 closes manually only after required hosted checks, merge into `dev` and
  approved-build acceptance. #91 remains open until that transition is accepted.

Historical purchase acceptance is superseded, not passed. Prior owner device
acceptance does not establish acceptance of this new free-only build.

## Signed-device and copy follow-up — 2026-10-01

The owner separately authorized an in-place update of the existing connected
iPhone app and free-download, cancellation/retry, offline and retention tests.
The follow-up uses a new branch based on the merged `dev` implementation. It has
not been committed, pushed or merged.

Three remaining messages in the unavailable-player, download-removal retry and
data-management screens now refer to download state and retained learning history,
not purchases. The rendered data-management assertion failed on the old purchase
copy, then passed after correction. Both focused service UI tests pass.

The fresh complete iOS 27 run reports 106 tests: 105 passed, one failed, zero
skipped. `testUngroupedPlayerCanEditGlobalGroupAndRevealPresets` failed while
clearing a numeric draft. Its unchanged focused rerun passes; this is not a green
full-suite result or a proven fix. All service/download/copy checks in the full
run pass. The six package baseline suites report 364 passing tests.

The first signed candidate used the locally generated Development configuration.
Its installation preserved the original profile, but launch selected a different
service namespace. The exported original build 1.0 (6) uses Production. No history
was imported or reset to conceal this mismatch. The corrected build 1.0 (8) uses
the original Production CloudKit configuration and existing development signing.

The mapper now validates APNs separately from the CloudKit environment and
preserves its signed provisioning value. A red/green regression covers Production
CloudKit with development APNs, invalid push values and mismatched CloudKit.
Existing beta identity, unexpected capability and internal-content checks remain;
CloudKit-enabled beta app signing still requires production APNs. Debug and signed
Release product guards pass.

Build 1.0 (8) was installed and launched on the authorized iPhone without uninstall
or reset. Quiescent private data copies were read through the public learning-store
and backup interfaces. The selected service scope, canonical learning payload,
two saved checkpoints, preferences and revision match the pre-update baseline
after launch. Automatic sync remains disabled and no reset is pending. These are
durable-state checks, not a claim that the interactive device journey was observed.

iPhone Mirroring still requests phone-side unlock/authorization. No live free
download, cancellation/retry, offline reference or microphone journey was completed
on build 8. Those gates remain open; simulator fixtures do not replace them.

## Automated acceptance follow-up — 2026-10-01

The owner requested direct or automated verification instead of manual testing.
XCTest ran on the authorized connected iPhone without requiring iPhone Mirroring.
The preceding incomplete device-test record is historical, not the final result.

- All six package suites freshly pass again: 364 reported tests. The configuration
  mapper self-test, CI configuration tests and signed Release product guard pass.
- A fresh complete, unfiltered iOS 27 simulator result reports 106 passed, zero
  failed and zero skipped. The numeric-draft test passes unchanged in this full
  run; no production correction is claimed for its earlier automation failure.
- The normal free-download and no-commerce UI test passes on the iPhone. It uses
  controlled bundled transfer through the normal UI and real filesystem; it does
  not establish Apple-server availability.
- Initial iPhone media tests exposed two test-fixture failures: missing placeholder
  files under an aliased temporary directory failed canonical-path confinement.
  A private device characterization reproduced the invalid fixture namespace.
  Canonicalizing the existing fixture parent fixes both failures. Only the test
  fixture factory changes; production asset validation remains unchanged.
- After that correction, all 53 native media/lifecycle tests pass on iOS 27
  Simulator. The earlier complete 106-test simulator result predates this
  fixture-only correction; it is not presented as a second full-scheme rerun.
- The final iPhone batch reports 60 tests: 59 passed, one failed, zero skipped.
  All 53 normal media/lifecycle tests, four download-lab tests, the downloaded
  checkpoint/relaunch UI journey and the private namespace characterization pass.
  Its reset journey uses a UUID-isolated test profile, never the owner's records.
  The separately passing normal free-download UI test is outside this denominator.

The one failure is a private probe of the actual Apple-hosted transport for the
already-configured sample pack, using a fresh temporary installation root. The
SDK fails before installation with type
`ManagedBackgroundAssetsXPC.ErrorCoding.SwiftErrorProjection`, an unclassified
domain and code `1`. This does not identify a definitive application, signing or
server cause. No existing installation or history was removed. Actual hosted
download, hosted cancellation/retry and offline use of that newly hosted package
remain unverified; controlled transfers are not substituted for those gates.

Apple supports local asset-pack testing through Xcode's background-asset setup
and mock-server configuration, separately from App Store/TestFlight delivery.
See [local asset-pack testing](https://developer.apple.com/documentation/backgroundassets/testing-asset-packs-locally)
and [Xcode 27 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes).
No certificate trust, developer URL overrides, hosted content, provisioning or
distribution configuration was changed to work around the SDK failure.

After the device tests, the original signed Release build 1.0 (8) was restored
in place, passed its product guard and launched successfully. The complete saved
learning payload, preferences and selected service scope match the pre-test
snapshot through public store/backup interfaces on quiescent private copies.
Both checkpoints and revision 108 remain; automatic sync is disabled and no
reset is pending. No uninstall, real-profile reset, purchase, account switch,
cloud sync/reset or TestFlight upload occurred.

Automated audio checks use generated signals and public lifecycle behavior; they
do not establish perceived microphone sound or haptic feel. This follow-up remains
local and uncommitted. No issue closure or new hosted CI result is claimed.

## Authorized internal distribution — 2026-10-05

The owner approved uploading the verified free-only Swift app and distributing
it to the existing internal group. The owner also approved updating the existing
iPhone to build 1.0 (9) and testing the hosted sample without uninstall, history
reset, purchase, account switch or cloud sync.

- Fresh package verification passes all 364 reported tests. The complete,
  unfiltered iOS 27 result passes 106 tests with zero failures and zero skips,
  including the previously corrected canonical fixture root.
- Configuration mapper, clean CI configuration and fictional service-build checks
  pass. A signed Release archive and internal-only distribution export pass the
  product guard, with iOS 26.0 minimum, no commerce metadata, Production CloudKit,
  production APNs, a non-debuggable beta signature and the existing app identity.
  Existing signing identities/profiles were reused without provisioning updates
  or identity registration.
- Export inspection reproduced a false positive in the product guard: `otool -L`
  prints the inspected executable's path before its dependency list, so an
  `export-inspection` directory incorrectly matched Expo. The guard now examines
  the indented dependency entries, not the unindented path header. A public-guard
  regression fails before this correction and passes afterward. It also compiles
  a real Mach-O dependency on a forbidden Hermes install name and requires its
  rejection. Runtime restrictions are not relaxed. Shellcheck and shell syntax
  checks pass; the fixtures are outside the shipped app's sources/resources.
- Apple accepted app build 1.0 (9) and completed processing. The existing technical
  encryption classification was retained after source inspection found only
  Apple-provided services and SHA-256 hashing, with no custom encryption
  implementation. App Store Connect shows **Testing**, assigned to **Controlled
  Sample** and the existing **Controlled Sample Auto** group. No new tester/group,
  asset-pack upload, external testing or public release was performed.
- The existing hosted sample remains **Ready for Internal Testing**. Readiness,
  upload acceptance and group assignment are not successful device delivery.

The connected iPhone still reports build 1.0 (8) before the update. A quiescent
pre-update copy was checked through the public store/backup interfaces: two
checkpoints, revision 108, sync disabled and no pending reset. Read-only UI
inspection showed 13 XP and a 1× playback preference. A second pre-update copy
matches the complete first snapshot after that inspection.

A separate UI runner reused the existing test identity and Xcode's documented
installed-artifact mode without making the product app an install dependency.
It failed device authentication before any test body ran; this is not a product
test pass. iPhone Mirroring subsequently connected and allowed direct UI control.

TestFlight initially displayed cached build 6. Its build-history route exposed
build 9 but would disable automatic updates, so that route was cancelled.
Restarting TestFlight refreshed the normal listing to the latest build 9 without
changing its existing automatic-update preference. The Mac then locked before
installation could proceed. Device installation, retention after update and live
hosted delivery remain pending; no successful installation is inferred from the
available Install button. Follow-up source changes remain uncommitted/unmerged,
and #108/#91 remain open.

## TestFlight device acceptance — 2026-10-05

After the owner unlocked the Mac, the normal latest-build TestFlight flow
installed 1.0 (9) in place. TestFlight showed Open and the device inventory
independently reported version 1.0, build 9. No older-build installation warning
or automatic-update change was required. The native app launched successfully.

A quiescent copy after the first launch matches the entire pre-update public
store/backup snapshot: selected service scope, canonical learning payload,
preferences, both checkpoints and revision 108. Automatic sync remains disabled
and no reset is pending. This comparison operates on private copies, not the
device's live store.

The normal Release UI was used without fixture arguments or a replacement Debug
build. The configured hosted sample was removed through its book-management
menu. Its confirmation states that only downloaded content is removed and
learning history remains. The sample then became unavailable for learning.
An explicit free Download completed through the production Apple asset adapter,
enabled stage selection and opened the existing downloaded checkpoint and its
lesson content. No purchase sheet, sandbox purchase login or paid-access state
appeared. Settings has no purchase-restoration route, and data-management copy
now refers to retained learning history rather than purchases.

The first cancel attempt arrived after the small sample had already installed;
that attempt is not cancellation evidence. A second, immediate cancellation
settled back to Download without enabling the lesson. Explicit retry then
completed and reopened the same checkpoint. This verifies early cancellation and
retry through the real hosted adapter, not cancellation after a measured amount
of network bytes. No bandwidth override, network setting, hosted pack or asset
version was changed.

After download removal, installation, cancellation, retry and lesson navigation,
another quiescent public-backup comparison retains both checkpoints, all reward
ledger records, preferences, selected scope and reset generation. English XP
remains 13, automatic sync is disabled and no reset is pending. Revision moves
from 108 to 111; only the hosted checkpoint's saved `audioSeconds` and `phase`
fields and its checkpoint clock change. Entering the lesson and opening its menu
play and pause the existing session; no confirmation control was pressed and no
new confirmation, completion or reward was recorded. This is expected durable
playback-state saving, not an unchanged byte-for-byte post-journey snapshot.

Build 9 remains installed with the sample usable. The earlier development-signed
hosted SDK probe failure is historical; successful TestFlight delivery does not
prove that failure's exact cause. A deliberately offline physical-device journey
and perceived microphone/haptic checks were not performed in this continuation.
Temporary offline network changes await separate permission. Controlled failure,
corruption, interruption and offline media coverage remains the separately
recorded automated evidence, not a claim of those faults injected into the
owner's normal Release app. The local source follow-up remains uncommitted and
unmerged; #108/#91 remain open.

## Repeatable controlled-offline acceptance — 2026-10-05

The owner approved replacing repeated hands-on functional checks with an
automated acceptance path. This approval does not authorize changing phone
radios, replacing the installed TestFlight app, using accounts/cloud services,
or claiming perceived microphone sound and haptic feel from generated signals.
The earlier TestFlight delivery and retention evidence remains separate.

The new Debug-only service failure is available only inside a valid UUID-scoped
product-test profile. The UI journey installs the public fixture through the
normal download boundary, explicitly confirms one cycle in that disposable
profile, saves a grouping preference and relaunches with external acquisition
and source reads unavailable. It waits for actual native playback completion,
checks the retained cycle, navigates to another local source and back, and
requires options dismissal to leave learning paused. Relaunch and reference
navigation must not create another confirmation or XP. Removing only the fixture
download makes offline re-acquisition fail; explicit online retry restores the
materials with the same checkpoint and XP. A second journey verifies that a
failed external download does not block the normal bundled lesson.

The installed-catalog package test also reconstructs delivery, catalog and
SQLite owners with no delivery transport. It reads the pinned syntax analysis
from the validated installation, keeps the restored lesson paused, and preserves
the complete saved state. Existing reference UI tests and complete media suites
remain in coverage, including monitoring recovery/cleanup policy and the native
AVAudioEngine gain graph. Those audio checks use generated signals, not captured
microphone payloads or listening judgments. Apple dictionary coverage concerns
presentation and ownership, not OS-provided definitions.

`native-ios/scripts/test-offline-acceptance.sh` runs all six package suites and
the offline/reference UI plus complete native media integration targets on an
already booted, dedicated iOS 27 simulator. It keeps private results locally and
refuses older, ambiguous, reference or physical destinations. Its lightweight
regression runs in `ci-quality`; the new UI class enters the existing `remaining`
shard without changing required checks or human release approval. The runner
rejects command failures, missing/empty results, skipped tests and missing
selected groups. A real Swift Testing characterization showed that a disabled
test can coexist with a passing process/summary; skipped-test rejection therefore
has its own failure-first regression.

Independent review corrected test-only weaknesses before final verification:
wait for preference saving to settle, wait for offline playback completion,
exercise actual source selection, and keep XP assertions outside the presented
player where the background header is deliberately hidden. The tests preserve
normal navigation and accessibility ownership; no production behavior was
changed to accommodate them.

Final local verification:

- All six complete package suites pass: LearningDomain 53,
  LearningPersistence 39, AppFoundation 77, LearningMedia 69,
  LearningReference 18 and AppleServices 108; 364 reported tests in total.
- The repeatable runner completes successfully with 61 native results:
  two offline UI journeys, six reference UI journeys and all 53 native
  media/lifecycle tests, with zero failures and zero skips. An earlier candidate
  failed because the test tried to use the options root's Close button while
  the source-list destination was pushed; the test now returns through the
  normal navigation Back button. No production navigation was changed.
- After the final review corrections, the complete, unfiltered iOS 27 scheme
  passes 108 tests: 55 UI and 53 native integration tests, with zero failures
  and zero skips. The build-tool response times out while the underlying
  Xcode process continues; the finalized result and successful execution log,
  not that timed-out response, establish this result.
- The runner failure/isolation regression, shellcheck, shell syntax,
  actionlint, clean CI configuration, service configuration mapper and scoped
  whitespace checks pass. Release product inspection and its real Mach-O
  runtime-guard regression pass; the Debug-only fixture remains excluded from
  the inspected Release product. These local results are not a new hosted CI
  or signed-device result.

The owner's TestFlight 1.0 (9) app and history were not touched. No physical
network changes, account access, cloud operations, reset, upload, commit, push,
merge or issue closure occurred. This follow-up remains local and uncommitted;
the new CI coverage takes effect only after the source is submitted and merged.

## PR submission checkpoint — 2026-10-05

After the owner requested a follow-up PR, all six complete package suites were
rerun and passed 364 tests. The complete, unfiltered iOS 27 scheme was also
rerun and passed all 108 tests, with zero failures and zero skips. Both offline
journeys appear as passed cases in the finalized result. Runner/configuration
regressions, Release product inspection, the Mach-O guard regression, shellcheck,
shell syntax, actionlint and staged whitespace checks pass.

Independent review of the 22-file PR scope reports no remaining findings. It
also corrected the formerly undated initial acceptance summary: the October 1
unverified-delivery/no-upload statements are historical, not the later verdict.
Unrelated local changes are excluded. No application code changed during this
submission verification; the review correction only clarifies the evidence.

This follow-up targets `dev` and still requires its own hosted checks and merge
before manual issue closure. Earlier uncommitted-state descriptions refer to
their recorded checkpoints. No new phone, radio, account, cloud, reset, content
upload or distribution action was performed for this PR verification.
