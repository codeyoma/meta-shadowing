# Video stage-one verification

## Scope and status

Issue #67 is implemented on `codex/video-learning`: explicit private preparation,
local installation/removal, and stage-1 inline video. Video stages 2–16 remain
unavailable. Existing audio packages keep their own adapters and identities.
Issue #67 remains open because the simulator demonstration is not yet performed.

The original media remains unchanged. Corrected English and final Korean are
read from the supplied export. The prepared identity covers media metadata,
phrase boundaries and final text, so changed content cannot inherit unrelated
checkpoints. No supplied content, identifiers or hashes are recorded here.

## Automated evidence — 2026-09-24

- `npm run check`: 420 core tests and 25 build/package checks passed; TypeScript
  passed. Tests include actual SQLite rewards/checkpoint behavior, three-cycle
  confirmation, Repeat +2, paused restoration, duplicate/stale events, partial
  failure, direct stage policy, and inline video placement.
- Preparation tests use fictional ZIP/media inputs. They verify byte preservation,
  final-text selection, content-specific identity, checksum rejection and redacted
  malformed-ZIP failures. No original media is a committed test fixture.
- Resource-copy tests verify explicit Debug opt-in and removal of stale resources
  in default and Release builds. The generated Xcode project was inspected for
  Debug-only opt-in and the private copy phase.
- `MacLearningAudioTests`: 21 native tests passed, including generated H.264 video
  with an AAC tone. AVPlayer stops at the bounded end, remains paused, exposes a
  retained decoded frame, seeks to a saved offset and replays from the beginning.
  Boundary/restore assertions allow 50 ms; replay-start assertion allows 10 ms.
  Malformed sources, modified files, symlink escape, obsolete owners, cancelled
  preparations and invalid media are covered. These are macOS AVFoundation tests,
  not iPhone acceptance or listening tests.
- Full arm64 iOS Simulator Debug app build passed with the current Expo native
  view and module. The initial build exposed an Expo initializer mismatch, which
  was corrected against the installed SDK. A separate initial universal build
  also failed in an ExpoImage framework-copy phase; the arm64 rebuild passed.
- `EXPO_NO_DOTENV=1 npm run bundle:ios`: passed. Supplied transcript and media-hash
  scans passed for the code diff and all exported files.
- The owner-supplied 17-phrase package was prepared and verified locally. The
  opt-in native build contains the current manifest and original media. It was
  not installed on a physical phone or uploaded.

## Review resolution

Standards review identified two documented breaches: a reused package identity
and subprocess errors exposing input paths. Both were corrected and regression
tested. The module now also limits teardown to its own video owner and suppresses
callbacks after module destruction.

Spec review identified three implementation gaps: reused identity, a missing
frame when reopening a saved decision, and silently discarded malformed metadata.
All three were corrected. Decision restoration prepares a paused frame without
playback, confirmation or additional XP. Malformed bundled metadata displays a
rebuild/reinstall instruction in the library. Native tests now include audio and
a decoded-frame assertion, not just a non-null player item.

## Local preparation and build

Use local paths in your terminal only; never paste resolved inputs into public
issues or CI. `private/` and generated `ios/` are ignored.

```sh
npx tsx scripts/package-video.ts '<lesson-export.zip>' '<original-video.mp4>'
LOCAL_VIDEO_ENABLED=1 EXPO_NO_DOTENV=1 npx expo prebuild --platform ios --no-install --no-clean
cd ios
pod install
```

Preparation refuses an existing `private/local-video` output. Keep an existing
package safe before preparing a replacement. The opt-in is a generated Debug
build setting, not a runtime setting. Regenerate without `LOCAL_VIDEO_ENABLED=1`
to turn it off. Release always omits the private resource.

The default Expo Debug app uses Metro and does not embed JavaScript. The native
build and export results above do **not** prove offline cold launch. Installed
video reads only local files; demonstrate the application offline separately
with an appropriate standalone internal build. Do not enable private content in
a public Release build to bypass this check.

## Remaining acceptance

- Boot an approved simulator and demonstrate installation, offline playback,
  three confirmations, Repeat +2, speed changes, restart, menu return, retained
  decision frame and missing/corrupt-media recovery.
- Measure seek/start latency on the target device. Integrity verification streams
  the complete file on preparation; it currently does not cache verification.
- Physical microphone monitoring, wired remote control, interruption/route changes
  and background interactions are unperformed here and remain in the follow-up
  video acceptance scope. No simulator was booted without approval.

The ignored iOS project was regenerated and Pods reinstalled during verification.
Tracked code and supplied materials were preserved. The earlier generated private
package is retained locally as a recoverable backup; it is not committed.
