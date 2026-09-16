# Apple-hosted controlled sample (#46)

## Implemented boundary

The catalog contains the existing bundled `morning-notes-v1` and a separate
`hosted-morning-notes-v1`. They share controlled, original sample text and speech,
but have independent learning/checkpoint identities. Neither is a paid entitlement.
The hosted entry never falls back to bundled audio. Existing settings, checkpoints,
SQLite identifiers and bundled files are unchanged.

Opening the catalog only checks app-local files. Download explicitly calls
`AssetPackManager.ensureLocalAvailability`; native progress drives the progress
indicator. Cancel uses the OS-provided `Progress.cancel()` and also prevents a late
completion from publishing an installation. Retry is explicit. A download can
continue while the catalog is unmounted; returning reads the native operation.

After Apple delivery, the installer verifies the pinned size and SHA-256 of
`manifest.json` and every required audio file, writes into a staging directory,
reads and verifies the written files, then publishes the versioned directory.
`ready` does not bypass verification. The player and lesson routes recheck local
readiness and use the same `LearningContext` and app-local audio paths as before.
A missing or damaged required file means download/recovery, not a playable book.

The manifest pin is in `assets/sample/delivery.json`; audio pins remain in the
controlled sample manifest. Do not replace files under a shipped learning version
or repoint this version to commercial content. A changed lesson requires a new
version and an explicit checkpoint compatibility decision.

## Owner-controlled Apple setup

The draft in-app purchase is independent of this sample and need not be submitted
to implement it. No purchase authorization or StoreKit check is added here.

Before real delivery, use the existing app record and register a shared App Group
for the app and its `SampleDownloader` extension. Set these in ignored local build
configuration:

- `APPLE_ASSET_APP_GROUP`: the registered shared group.
- `APPLE_SAMPLE_ASSET_PACK_ID`: the identifier of this controlled sample pack.

The config plugin adds app Background Assets plist keys, shared entitlements and
the managed Background Download extension. Both targets need matching valid
provisioning. Missing configuration leaves delivery visibly unavailable; partial
configuration fails prebuild. Disabling delivery or changing its App Group requires
`npx expo prebuild --clean --platform ios --no-install` followed by `npx pod-install`.
The plugin rejects an incremental `--no-clean` rebuild in those cases so old
targets or entitlements cannot silently survive. The generated `ios/` project is not the source of truth.
Do not preserve signing changes only in that generated project.

Run `npm run package:apple-sample` with the same asset-pack identifier. The script
verifies and selects only the controlled manifest and its explicitly listed audio,
uses `onDemand` and `iOS`, and creates a fresh archive under ignored
`private/apple-assets/`. It does not upload anything. There are no private DUO
content, purchase identifiers or credentials in the archive source list.

Upload that archive separately through Apple's supported tools, then distribute
the matching signed build through internal TestFlight. Upload, signing registration
and submission are owner-controlled operations, not side effects of this script.
CI uses explicitly fictional identifiers to compile the extension unsigned; that
is not evidence of live service configuration or delivery.

## Acceptance still required

Keep #46 open until this entire sequence has evidence from actual Apple hosting:

1. Process the controlled archive in App Store Connect and install the matching
   TestFlight build. Confirm the catalog alone does not download it.
2. Download explicitly and observe native progress. Cancel, confirm it is not
   playable, then retry successfully.
3. Open and play the downloaded sample through the normal learning screen.
4. Quit the app, disable connectivity and Metro, cold launch and play its speech.
   Confirm checkpoint resume and settings remain intact.
5. Exercise missing/corrupt local-file recovery on a controlled test installation;
   verify the app offers download rather than entering a broken player.

Simulator tests cover download-state and real filesystem installation boundaries
with a substituted external delivery service. They are not TestFlight acceptance.
Apple's optional local `ba-serve` testing requires trusted HTTPS configuration;
do not install a root certificate or weaken device security as an implicit step.
Keep account details, device identifiers, signing material and raw logs private.

## Local verification (2026-09-13)

- `npm run check`: 182 TypeScript tests passed; typechecking passed.
- `npm run bundle:ios`: standalone JavaScript bundle exported.
- Delivery Simulator suite: 6 tests, 14 parameterized cases passed. StoreKit's
  14 tests and CloudKit's 34 tests also passed. Generate each fixture with
  `xcodegen generate --spec tests/<suite>/project.yml`, then run its scheme with
  `xcodebuild test` against an available iOS 26 Simulator. CI contains exact commands.
- Configured unsigned Release Simulator build passed; the built app contains
  `Extensions/SampleDownloader.appex`. The build used fictional fixture IDs only.
- Apple's `ba-package` accepted the archive; inspection found the controlled
  manifest and twelve speech files, plus Apple's packaging metadata.
- Incremental configuration checks rejected disabling/changing a stale App Group
  and accepted clean unconfigured and unchanged configured inputs.

These are local results, not sandbox purchase, signed-device, upload or TestFlight
acceptance. The configuration review finding was fixed; a non-blocking suggestion
to use a native enum for delivery phases remains optional.

## Follow-up verification (2026-09-16)

The original sample implementation is integrated through PR #56. Settings/player
integration tracked in #54 was merged through PR #55 with all four required CI
checks passing; #54 is complete independently of this ticket's hosted acceptance.

The follow-up adds one native-progress/cancel footer, neutral download/recheck
actions, settings drawers and light-mode surfaces, aligned header controls, curved
stage connectors, tap-position XP feedback, and cycle-specific native haptics.
The separate [free DUO internal test](free-duo-testing.md) does not grant a paid
entitlement or satisfy #47's purchase/download acceptance.

Fresh publication checks: 260 core tests, 6 build-settings tests, 3 preparation
tests and strict TypeScript passed; the iOS JavaScript/Hermes export passed.
The native delivery suite passed 21 tests with the optional private fixture
configured (zero failures/skips), including validation and local decoding of all
560 prepared files. Without that private fixture, its one content-specific test
is intentionally skipped; no private content is required by public CI.
Read-only review found no Critical or Important code findings.

Keep #46 open: no actual Apple-hosted TestFlight download or physical-iPhone
offline cold-launch/playback is established by these tests. Physical haptic feel,
accessibility and device audio interactions also remain unverified. No asset/app
upload or public release is included in this publication.

## References

- [Download Apple-hosted asset packs](https://developer.apple.com/documentation/backgroundassets/downloading-apple-hosted-asset-packs)
- [Create managed asset packs](https://developer.apple.com/documentation/backgroundassets/creating-managed-asset-packs)
- [Test Apple-hosted asset packs](https://developer.apple.com/help/app-store-connect/test-a-beta-version/test-apple-hosted-asset-packs)
