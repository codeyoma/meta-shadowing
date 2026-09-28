# Native media and feedback contract (W4 / #95)

## Boundaries

`LearningMedia` consumes the W3 `LearningController`. Only explicit committed
learning actions can grant credit. Playback end, time sampling, interruption,
restore, haptics and teardown cannot confirm learning. `NativeLearningRuntime`
composes one mounted lesson's coordinator, audio session, monitoring graph,
remote controls, lifecycle observations and learning haptic player. Consumers
must await `close()` before replacing the lesson or writer.

The caller supplies an authorized installed root and exact source catalog for
the plan. Catalog validation rejects escaped paths, remote URLs, mixed kinds,
overlapping video segments and mismatched source counts. It does not grant
content ownership or implement W7 delivery. Access is checked before preparation
and again before output. Fixtures are synthetic and reveal no personal content.

## Transport and lifecycle

Audio uses up to four original files in an `AVQueuePlayer`; video uses one
original audio/video asset and ordered selected segments. Exact combined-time
boundaries choose the next selected member. Video uses native forward end bounds
and native completion notifications to skip excluded gaps, independent of UI
time sampling. The final decoded frame remains visible until replacement.

Tokens bind writer, plan, unit, cycle and transport generation. Late readiness,
seek, position and completion callbacks cannot affect a retired transport.
Readiness observes AVFoundation with a cancellable 15-second deadline. Paused
drivers remove periodic and item observers. The coordinator coalesces ordinary
position checkpoints to at most one per second, plus member, end and pause
boundaries. Suspension stops hardware synchronously, drains the latest relevant
position and pause after an in-flight save, then revokes the controller on exit.
Foreground and menu dismissal never imply resume. Failed saves remain visible;
retry commits the original action once and leaves transport paused.

Silent stages use a monotonic, next-word deadline clock without opening a media
driver. Pause preserves partial-word elapsed time. Reveal completion still needs
manual confirmation. Separately authorized wired monitoring is independent of
silent reveal timing.

Session intent is main-actor-owned; OS configuration/activation is serialized
off the UI executor. iOS 27 uses Apple's asynchronous activation APIs, while
iOS 26 uses the synchronous API off the main actor. A released activation lease
cannot start playback. Playback cleanup cannot deactivate live monitoring.
Interruption and media-services loss/reset invalidate cached OS state and pending
activation generations. The session drains to inactive without dropping logical
remote ownership. Release, foreground and interruption-end events do not reactivate
it; the next explicit playback or monitoring request configures and activates it
again. A late pre-interruption activation cannot restore the invalidated cache.
See [Apple's audio-session activation API](https://developer.apple.com/documentation/avfaudio/avaudiosession/activate(options:completionhandler:)).

## Wired monitoring and headset actions

Monitoring supports exactly one `.headphones` output, preferring headset mic and
then built-in mic. Bluetooth, AirPlay, speaker, receiver and generic USB routes
are not eligible. Capture starts only in a foreground, eligible lesson after
permission. Existing capture may continue through temporary menus/background;
exit, access loss, completion, route loss or interruption stops it. Manual OFF
persists for the current connection. Only the initial permission-sheet
inactivity cancellation can retry automatically once. No buffers are recorded,
saved or exported. Microphone-only gain is 4x followed by a device-local 0...1
control, initially 0.25. Original media bypasses that gain path.

Headset play/pause/toggle means the same guarded main action as the visible
control; next-track means an actionable third-cycle Repeat. An owner/revision
gate accepts one press per revision with 0.35-second debounce. Unavailable,
stale, background and menu-open presses cannot confirm. No double-click timer,
silent keep-alive audio or hidden sample player is used.

## Feedback and launch

`CommittedLearningFeedback` is keyed by the original command ID and derived
from committed source progress, not aggregate XP. Retry, lost replies and failed
recovery pauses preserve a single unpublished event. State reads and restoration
are quiet. Third-cycle Repeat has its own pulse; already-confirmed Next is quiet.
The coordinator consumes events once, discarding obsolete navigation feedback.

Cycle 1/4 has two pulses, cycle 2 three, cycle 3/5 four, and Repeat one.
Pulse spacing is 0.08 seconds. Launch has five mouth-opening pulses at
0.24, 0.66, 0.89, 1.39 and 1.81 seconds with the already-doubled intensities.
Separate haptics-only Core Haptics engines never reconfigure lesson audio.
Unsupported hardware/errors are silent. Stop/reset/inactivity discards feedback;
it is never replayed. The existing device-local learning preference is honored;
launch has no application opt-out menu.

The unchanged bundled WebP decodes to 17 frames totaling 2.4 seconds through
ImageIO. A discrete Core Animation sequence preserves variable frame delays;
the native animation-start callback starts launch haptics. The puppy is 160x160
points, with an uncropped 220x146.667-point wordmark image box 58 points above the
screen bottom. Reduce Motion skips animation delay and haptics. Missing artwork
has a five-second escape; inactivity finishes launch permanently. Slow bootstrap
shows static artwork without replaying animation. Bootstrap errors retain their
own recovery UI. No image generation, conversion, download or WebView is involved.

## Verification and remaining acceptance

Local verification on 2026-09-28 exercised real grouped audio/video, pause/seek,
cancelled preparation, missing/corrupt media, final-frame retention, duplicate
native end events, observer removal, SQLite/no-credit invariants, feedback retry,
17-frame decoding and generated-media UI relaunch on iOS 27. Package-only tests
are not evidence that iOS adapters ran.

Final automated results: LearningDomain 53, LearningPersistence 24,
AppFoundation 26 and LearningMedia 42 tests passed (145 total). The iOS 27 scheme
ran 27 tests: eight XCUITests and 19 actual native integration tests, with zero
failures or skips. Debug and Release builds and product guards passed. The
local TypeScript oracle matched; actionlint, three branch-policy tests and the
clean-checkout configuration guard passed. PNG build processing is disabled so
all three bundled launch assets remain byte-identical to their supplied sources.
This is local evidence, not a hosted GitHub Actions result.

The PR #102 interruption regression failed before the fix for interruption,
media-services loss and reset, then passed after session invalidation was wired
into the runtime. It changes actual simulator audio-session configuration to
exercise recovery on explicit Resume, not only notification delivery. Package
tests also cover dormant remote ownership, interrupted activation and monitoring
recovery without automatic output. This does not simulate a real phone call.

### Standards review

Four Important findings were corrected: pending microphone activation at menu
entry, missing visible media recovery, opening/teardown races, and remote-resource
release on completion. A deterministic deferred-fixture test reproduced the
reappearance race before its fix. The final independent recheck found zero
Critical, Important or actionable Minor findings.

### Spec review

Three Important findings were corrected: menu-entry microphone activation,
visible media recovery, and lost exact position through explicit pause. The
final independent recheck found no remaining actionable findings or scope creep.
The overlap with Standards is intentional; the axes remain separate.

### Issue acceptance mapping

| #95 item | Evidence | State |
| --- | --- | --- |
| Audio queues and bounded/grouped video | Native queue/video fixture tests, exact boundaries, rates, seek and retained frame | Implemented and tested |
| Reviewed Swift services without Expo wrappers | Adapted native services and Debug/Release dependency guards | Implemented and tested |
| Lifecycle, routes, monitoring and headsets | Policy tests, native notifications, activation cancellation and teardown tests | Automated checks pass; hardware pending |
| Launch/cycle feedback and animation | Commit/retry tests, literal pulse schedules, 17-frame native decoding and launch UI tests | Automated checks pass; tactile alignment pending |
| Play/pause/reentry/group/failure/background | Native fixtures plus audio/video/silent XCUITests | Passed |
| Retired callbacks and resource cleanup | Transport generations, deferred seeks, menu activation, opening/teardown and remote-completion regressions | Passed |
| No credit from media events | Real SQLite coordinator and UI tests | Passed |
| Native fixtures and separate hardware report | 27 native/UI tests; pending device checklist below | Fixtures passed; device observations not claimed |

Physical acceptance remains **pending**: wired output and microphone routing,
voice-only gain, permission dialogs, single/double headset dispatch, unplugging,
real interruptions, lock/background behavior, launch pulse alignment and tactile
cycle feedback. Simulator notification injection and pattern construction do not
prove those hardware behaviors. Installing/replacing the physical app requires
separate explicit authorization. No account, cloud, purchase, benchmark or
release operation is part of W4 verification.
