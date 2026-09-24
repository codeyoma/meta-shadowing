# Video learning verification

## Silent stages 11–16 implementation — 2026-09-24

- #69 enables the remaining six stages for the same installed video package.
  They reuse the existing silent reveal clock and finalized text, not media
  segment durations or ASR timestamps. No native video owner is allocated, so
  leaving a silent stage does not invoke native video teardown either.
- SQLite-backed Player tests cover all six stages: unchanged finalized text,
  language order, cumulative reveal, fixed S3 at 200 WPM, partial-word pause,
  database close/reopen, completed-reveal reentry, explicit +3 XP confirmation,
  immediate next-phrase start and idempotent completed-stage restoration.
- The new integration tests exposed rejected Next/Repeat actions stopping the
  reveal clock. Session transitions now retain their identity for a no-op,
  allowing Player to reject those actions without touching playback or credit.
- `npm run check` passed 433 core tests, 25 build/package checks and TypeScript.
  Route tests exercise the actual transport initializer and cleanup with native
  audio/video boundaries forbidden. Existing presentation tests cover hidden
  video/cycle controls, S1–S4 controls and text accessibility.
- This change was verified automatically; no new physical-device test or native
  build is claimed. Expanded device interruptions and monitoring remain in #70.

## Stages 2–10 implementation — 2026-09-24

- #68 enables phrase video in stages 2–6 and saved video groups in stages 7–10.
  Stage 1 remains supported. At that revision, silent stages 11–16 were gated;
  the #69 section above records their subsequent enablement.
- One AVPlayer plays the selected manifest segments in order, skipping source
  gaps. Position/duration use the sum of selected durations. Member boundaries
  do not emit a cycle end, pause, confirmation or reward. The final frame stays
  visible; replay and paused restoration use the same saved unit mapping.
- `npm run check` passed 427 core tests, 25 build/package checks and TypeScript.
  `npm run test:native-headers` passed 7 checks. Adapter tests exercise real
  mapping/restoration with native SDK boundaries replaced. SQLite-backed Player
  tests preserve saved groups, partial-failure checkpoints, short remainders,
  hints, three-cycle confirmation, Repeat +2 and idempotent per-member XP.
- Native macOS tests passed: 38 test functions / 41 parameterized executions,
  zero failures or skips. Generated audio/video covers gap skipping, rate,
  final decoded frame, second-member resume, first-member replay, duplicate end
  notifications, pause/replacement during a pending seek and failed transitions.
- Independent Standards and Spec reviews identified native endpoint rounding and
  inconsistent cumulative floating-point arithmetic. Both were reproduced by
  failing tests and corrected. Completion compares native CMTime boundaries;
  checkpoint encoding and lookup now use identical segment-duration sums.
- Simulator verification exposed an additional integration gap: the stage list
  still displayed only stage 1. It now follows the shared stage policy. A
  regression test exercises the real hook and SQLite-backed learning context,
  covering video stages 1–10 and unchanged audio stages 1–16.
- A current full native Simulator build demonstrated stage 9 with three-member
  groups and first-word hints. Playback retained its final frame; confirmation
  displayed +3 XP, restarted at the first member, and Repeat expanded three
  cycles to five. Opening a menu paused playback; closing it preserved the frame
  without autoplay, and explicit resume continued the group. Changing the
  preference from three to two retained the active six-unit, three-member run.
  The original two-member preference was restored. Exact gap exclusion and
  short final groups are additionally covered by generated-media/core tests;
  simulator observations are not an instrumented listening test.
- The arm64 iOS test-fixture build passed. This is compilation evidence, not
  physical-device acceptance. Expanded device interruptions and monitoring remain
  #70; no new physical-device install was performed for #68.

## Scope and status

Issue #67 is implemented on `codex/video-learning`: explicit private preparation,
local installation/removal, and stage-1 inline video. The section above records
the later #68 expansion. Existing audio packages keep their own adapters and identities.
Issue #67 acceptance is verified through automated tests, simulator interaction
and physical-device checks. Standalone offline cold launch and local playback
passed on the owner's iPhone; missing/corrupt-media recovery passed in Simulator.

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

## PR preparation evidence — 2026-09-24

- Fresh `npm run check` passed: 422 core tests, 25 build/package checks and
  TypeScript. `npm run test:native-headers` passed all 7 checks.
- The video now fills the screen width without rounded corners and stays fixed
  below the top navigation. Only the text viewport scrolls; playback controls
  remain fixed. Layout regression tests cover this separation, preserved text
  insets, silent stages and unavailable/unauthorized lessons.
- The live simulator demonstrated text scrolling without moving the video area
  or controls. Reloading and reopening the same lesson restored the video frame
  at the same phrase without confirming a cycle or advancing progress.
- The outgoing diff was checked against the private transcript and media identity,
  local-path and credential patterns, and private payload file paths. No matches
  were found. Private materials and unrelated scratch files remain untracked.

## Review resolution

PR #71 follow-up addresses both review findings:

- Package verification now caches a process-local result against the file path,
  device/inode, size, and nanosecond modification/change timestamps. Every access
  still checks path safety and file metadata. Changed or replaced media is
  rehashed; removal/reinstallation clears the cache; a new package instance
  revalidates the bytes. Metadata is checked again after hashing before caching.
  The regression first reproduced 42 full reads during repeated access, then
  passed with one verification and a second verification after relaunch.
- Playback requires a decodable audio track with loadable format descriptions
  before emitting ready. A failed preparation cannot play the previously retained
  item. A generated video-only fixture reproduced the failure before the fix;
  the fixed player rejects it without ready or playback.
- Fresh `MacLearningAudioTests` passed all 32 reported test cases, including
  same-size edits with a restored modification date, atomic replacement, removal,
  reinstall, symlink rejection, and existing bounded playback tests. Fresh
  `npm run check` passed 422 core tests, 25 build/package checks and TypeScript.
  The native fixture also passed an arm64 iOS Simulator build-for-testing;
  this compile check does not claim a physical-device test.

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

## Interactive acceptance

### Physical-device acceptance attempt — 2026-09-24

- Built and installed the merged #67 code on the owner's connected iPhone using
  development signing. Existing app data was retained, and the local progress
  databases were copied to a private local backup before installation.
- Prepared an explicitly local, ignored Debug build override to load an embedded
  JavaScript bundle instead of Metro. The private video remains Debug-only; no
  Release content gate was changed and nothing was uploaded to App Store Connect.
  The packaged original media matched its manifest checksum; all 17 phrases were
  present. No learning-engine code changed for this attempt.
- The first offline launch reproduced Expo's embedded-development-bundle error:
  `Cannot create devtools websocket connections in embedded environments.`
  The local build was corrected to bundle JavaScript with `--dev false`, rebuilt,
  and reinstalled. Native compilation remains Debug for private local content.
- The replacement's first launch was blocked by iOS's development-signature trust
  check while offline. After the owner restored connectivity and opened the app,
  the library opened without the Expo startup error. The local video package then
  installed successfully. A subsequent offline cold launch passed after this
  first trusted launch, as detailed below.
- Physical-device interaction demonstrated stage-one video playback, a retained
  frame at the phrase boundary, and explicit confirmation. Two confirmations
  added exactly 2 XP. Repeat at the third decision confirmed that cycle and
  expanded the plan from three to five, without pre-crediting the extra cycles.
  Confirming both extra cycles advanced to the second phrase with exactly 5 XP
  added in total. Read-only copies of the device database verified these results.
- The speed menu saved the displayed 3x rate. Closing it retained the second
  phrase in the speaking phase with playback paused and no additional XP.
  Audible output and malformed-media recovery have not yet been established by
  this physical-device sequence.
- Fresh `npm run check` passed 422 core tests, 25 build/package tests and TypeScript.
  Fresh `MacLearningAudioTests` passed 32 tests with zero failures.

The owner authorized a temporary Airplane Mode/Wi-Fi change and initially
confirmed offline settings directly on the phone. Connectivity was subsequently
restored for development-signature verification; Wi-Fi was visibly connected
during the playback checks above.

### Offline cold-launch acceptance — 2026-09-24

- The owner enabled Airplane Mode and disabled Wi-Fi again. The mirrored physical
  phone showed the airplane indicator without a Wi-Fi connection throughout this
  check. The installed app was terminated and launched again over the USB device
  connection; it opened the library without Metro, internet or a startup error.
- The stage entry restored phrase 3/17 with two of three cycles confirmed and
  the existing 35 XP. These values included additional practice by the owner
  after the earlier interactive test. Reopening the lesson retained its decoded
  video frame and confirmation state without adding XP.
- One explicit confirmation advanced to phrase 4/17. Successive observations
  showed the local video change frames and stop at the phrase boundary while
  offline. Device database snapshots confirmed exactly one additional XP,
  reaching 36 XP, with zero confirmed cycles on the new phrase and rate 1x.
- The device owner was asked to restore Airplane Mode OFF and Wi-Fi ON, then
  reported that the app appeared to work correctly. This is owner-reported
  usability evidence, not an instrumented listening or latency measurement.
  Network restoration was requested but was not independently observed.

### Simulator missing/corrupt-media recovery — 2026-09-24

- Backed up only the simulator's installed test video and local progress databases.
  Physical-phone files and the supplied source materials were not changed.
- Moved the installed video out of its expected location, then resumed the lesson
  through the stage screen. The app blocked learning, displayed installation-check
  guidance and retained the learning record. Following the visible lesson/library
  actions exposed the normal download button; reinstalling restored the original
  media byte-for-byte and reopened phrase 5/17.
- Changed one byte in the installed test video while preserving its file size.
  Reentry rejected the changed checksum instead of trusting the prior successful
  verification. The same visible recovery path reinstalled a matching original
  and resumed the saved phrase. Video frames advanced and playback stopped at
  the phrase boundary, awaiting manual confirmation.
- Both failures and both reinstall/reentry cycles retained exactly 129 total XP
  and identical serialized video checkpoints: phrase 5/17, zero confirmed cycles
  of three, rate 1x. No confirmation action was taken during these tests.
- Fresh `npm run check` passed 422 core tests, 25 build/package checks and
  TypeScript. Fresh `MacLearningAudioTests` passed all 32 cases, with zero failures
  or skipped tests. No product-code change was required.
- The simulator recovery demonstrations complement the preceding physical-device
  installation, offline cold launch, confirmations, Repeat, speed and menu checks.
  This is combined acceptance evidence, not a claim that every scenario ran in
  one continuous simulator session. Temporary fault injection is no longer active;
  the installed test video matches its verified backup.

## Follow-up validation outside stage-one acceptance

- Measure seek/start latency on the target device, including the first full
  integrity check after relaunch and subsequent metadata-only cache hits.
- Physical microphone monitoring, wired remote control, interruption/route changes
  and background interactions are unperformed here and remain in the follow-up
  video acceptance scope. No simulator was booted without approval.

The ignored iOS project was regenerated and Pods reinstalled during verification.
Tracked code and supplied materials were preserved. The earlier generated private
package is retained locally as a recoverable backup; it is not committed.
