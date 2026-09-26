# DUO 3.3 free internal test

This is a separate test package, not a StoreKit purchase or restored entitlement.
The paid product and its purchase state remain unchanged. Never submit a free-test
binary for public release. Audio/text stay under ignored `private/`; do not commit
or attach those generated files to public issues.

## Prepare once

From the native checkout on macOS:

```sh
npm run package:free-duo -- '<DUO source directory>'
```

The source must contain the expected `info.json`, `text.txt` and `audio.zip`.
The tool validates 560 phrase blocks / 45 sections, preserves multiline dialogue,
allowlists numbered MP3 entries, converts them to AAC/M4A, pins sizes and SHA-256,
and writes `private/free-duo/DuoFreeTest.aar` when no analysis is supplied. If the
source includes `text-syntax.json`, it writes the new version to
`private/free-duo-v2/DuoFreeTest.aar`, with the unchanged analysis bytes pinned as
`syntax.json`. It does not upload anything. Existing
prepared output is never overwritten; changed content needs a new version and pins.

To add analysis to an already prepared v1 without re-encoding its audio:

```sh
node scripts/free-duo-syntax.mjs '<path to text-syntax.json>'
```

This verifies all 560 source entries with the production analysis parser and all
legacy audio digests, then creates `private/free-duo-v2`. It refuses to replace an
existing output. The internal build selects v2 when that directory exists and
requires valid syntax pins; otherwise it retains the legacy v1 configuration.
Rebuild the native binary so its manifest, descriptor, and asset-pack ID agree.
V1 materials and checkpoints are not rewritten or migrated. V2 starts separate
version-scoped learning progress; book-level award identity remains unchanged.

## Build the internal app

```sh
APPLE_FREE_DUO_TEST=1 APPLE_BUILD_CHANNEL=internal npx expo prebuild --platform ios
```

Keep the existing registered Apple App Group and sample delivery configuration.
Rebuild the native app after prebuild; a Metro reload cannot change its pins.
The internal build embeds only the test manifest, not the audio archive. Library
shows `DUO 3.3 · 무료 테스트`. Download, cancellation, validation, retry and removal
use a dedicated native download actor and the configured immutable installation
(`duo-33-free-test-v1`, or `duo-33-free-test-v2` with analysis).
Existing sample/progress keys are preserved. Material deletion does not delete
learning records. The current player supports stages 1–2; this does not implement
the deferred learning methods.

The native bridge checks both explicit build opt-in and a development/simulator
or sandbox-receipt environment. Unknown/production environments reject every free
operation and expose no free catalog manifest. This guard is **not paid DRM**.

## Actual delivery

- **Internal TestFlight:** upload the archive as Apple-hosted asset pack
  using the configured version's asset-pack ID, wait until ready for internal testing, then upload/install
  the separately built internal app. App and asset uploads are separate actions.
- **Xcode device / simulator:** configure Apple's Background Assets local test
  server and Development Overrides. A directly installed build does not get
  TestFlight-hosted assets merely because the pack exists in App Store Connect.
- No arbitrary/public URL, automatic purchase, account agreement or paid ownership
  override is introduced. StoreKit testing remains a separate task.

Apple references: [internal asset testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/test-apple-hosted-asset-packs),
[local test server](https://developer.apple.com/documentation/backgroundassets/testing-asset-packs-locally).

## Return to normal build

Unset `APPLE_FREE_DUO_TEST` and `APPLE_BUILD_CHANNEL`, then regenerate and rebuild
the native project. The plugin removes stale free manifest/descriptor fields from
Info.plist. Do not archive the previously generated internal project as production.

Checks: `npm run check`, `npm run test:free-duo`, and the delivery Swift test suite.
Set test-runner `DUO_PREPARED_PATH` to the prepared directory for the optional
private-content test: corrupt-last-file rejection, full validated installation,
and decoding every installed audio file without network access. This is not proof
of an Apple-server download or audible playback on a physical phone.

## Local verification — 2026-09-16

- 260 core, 6 build-settings, 3 preparation/configuration, and 21 native delivery
  tests passed; TypeScript and diff whitespace checks passed.
- All 560 actual prepared audio files passed digest verification and installed-file
  decoding. A damaged final file could not publish a playable installation.
- Release simulator build succeeded and displayed the free DUO card alongside the
  unchanged paid product. Existing sample progress and XP remained intact.
- The simulator download attempt failed safely because no DUO delivery environment
  has been provisioned yet. No false ready/learn state was exposed.
- No asset/app upload, physical-device installation, or Apple-server download was
  performed. Those remain the next acceptance step. The receipt-environment check
  currently uses Foundation's deprecated receipt URL API; it is not purchase proof.
