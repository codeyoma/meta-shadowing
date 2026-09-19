# Package download and reinstall recovery — #48

## Scope

This follow-up is based on #47 at `bd09c9d`. The owner approved proceeding while
its PR is still open. No PR was merged as part of this work; integrate the latest
`dev` after #47 lands before publishing this dependent branch.

The implementation reuses the existing StoreKit authorization, native installer,
scoped removal, and local-first learning journal. It does not introduce another
download service, reset progress, migrate accounts, or include private DUO files.

## Recovery behavior

- Deliberate cancellation stays quiet for paid, free-test, and sample downloads,
  including when the follow-up status query fails. Real failures remain actionable.
- A missing/corrupt source marks its managed cache for cleanup on the next
  explicit retry. The existing native purge closure targets only the configured
  asset pack. Paid retry still passes through current StoreKit authorization;
  publication still requires the original authorization lease to remain valid.
- A failed cache purge stays retryable without publishing an installation. A
  failed purge after material removal is disclosed as partial cleanup, not a
  failed local deletion or a claim that all disk space was freed. The next
  download retries cleanup. No automatic redownload is introduced.
- Successful native verification/publication records a 64-byte content
  fingerprint in `.identity-<package-key>`, outside the removable material tree.
  It covers the canonical descriptor, including all pinned file hashes. Entry
  order is irrelevant. Once that fingerprint exists, reusing its version key with
  different content is rejected before replacing the existing installation. Removing materials keeps
  this identity because retained checkpoints still refer to that content.
- Legacy installations acquire the fingerprint only after all currently pinned
  files verify. Identity records never act as readiness markers or ownership.
  Missing/corrupt local files still require full verification after reinstall.
- Conflicting identities show an update/compatibility explanation, not a prompt
  to erase learning history. New version keys keep separate checkpoints; an
  incompatible phrase count is rejected rather than silently starting over.

## Local verification — 2026-09-19

- Red → green: same-version replacement, including after removal; explicit
  authorized retry of missing/corrupt managed content; cancellation and recovery
  message presentation. The native replacement test first observed an unwanted
  successful overwrite; the cache retry test first failed to become ready.
- `npm run check`: 349 core, 8 build-setting, 3 free-package, and 10 paid-package
  tests passed, followed by TypeScript checking.
- `EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios`: passed.
- Native delivery suite on iOS Simulator 26.5: 28 tests passed, 0 failed, 1 skipped.
  The existing optional prepared-private-content test was skipped because no
  private package was supplied. New recovery tests are not skipped.
- The disk-backed SQLite journey closes/reopens the database after material
  removal and reinstalls controlled content. It preserves an unfinished cycle,
  1.75-second position, 0.75× speed, one completion, 7 XP, and a one-day streak.
  Offline resume does not call the source/download port or award XP again.
  This is host-filesystem/SQLite evidence, not a killed iPhone app or live Apple
  delivery. Native real-file tests separately cover the Swift installer.

Reproduce core and native checks:

```sh
npx tsx --test src/core/package-recovery*.test.ts
npm run check
xcodegen generate --spec tests/delivery/project.yml
xcodebuild test -project tests/delivery/PackageDeliveryTests.xcodeproj \
  -scheme PackageDeliveryTests \
  -destination 'platform=iOS Simulator,id=<TEST_SIMULATOR_ID>,arch=arm64' \
  -parallel-testing-enabled NO -quiet
```

## Remaining acceptance and limits

- #48 remains open for actual Apple-hosted, TestFlight, offline cold-launch and
  reinstall recovery on a designated iPhone. Live paid testing also requires #45
  and #47 readiness. Coordinate shared device evidence with #61.
- Simulator fixtures model corruption, insufficient storage, rejected writes,
  cancellation and authorization changes; they do not fill a real device or
  claim live OS-managed eviction/download acceptance. No destructive owner-device
  test was performed. Native full-app Release build and UI interaction were not
  rerun in this follow-up; the native delivery fixture compiles the changed Swift.
- The identity record is local compatibility metadata, not DRM, a receipt, or
  cloud-synced progress. It cannot recover an identity removed by app uninstall,
  or establish historical content identity on an unverified legacy installation.
  Releases must continue using a new package version for changed content.
- Cache-repair intent lives with the coordinator. After process termination, a
  retained bad managed cache may fail once again before explicit retry purges it.
- Only app-owned fixture paths were removed in tests. No purchases, account
  changes, private uploads, signing changes, remote merges or public release.
