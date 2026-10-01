# Free learning packages — #108

Owner direction and design approved on 2026-10-01. Refs #108. Refs #91.

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

## Local test evidence

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

## Acceptance still separate

- This change has not been pushed or run through hosted Swift CI.
- A separately approved signed build still needs a live free-package download
  and in-place update check retaining existing device records/settings.
- No device replacement, account switch, purchase, cloud reset, content upload,
  TestFlight distribution or public release is performed for this implementation.
- #108 closes manually only after required hosted checks, merge into `dev` and
  approved-build acceptance. #91 remains open until that transition is accepted.

Historical purchase acceptance is superseded, not passed. Prior owner device
acceptance does not establish acceptance of this new free-only build.
