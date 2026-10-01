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
remote ownership. Release and foreground events do not reactivate learning playback;
the next explicit Resume configures and activates playback again. Monitoring has
the separately approved recovery policy below and reacquires only its own lease.
A late pre-interruption activation cannot restore the invalidated cache.
See [Apple's audio-session activation API](https://developer.apple.com/documentation/avfaudio/avaudiosession/activate(options:completionhandler:)).

## W5 presentation and paused edits

The normal player observes `NativeLearningRuntime.controls` for semantic state
and `motion` only inside timeline/reveal views. Control equality excludes position
and writer-version churn; the compatibility aggregate `state` is retained for
existing probes. `LearningCyclePresentation` shows current media fraction or an
ended unchecked outline; it never grants credit. A new preparation clears the
previous transport sample so the next cycle cannot display stale progress.

`LearningMediaCoordinator.editWhilePaused(_:)` accepts only rate, group, reveal
speed and source-selection commands. The writer must be active, foreground and
authorized, with a successful settled pause. It does not reopen the menu's remote
action gate and cannot accept resume or confirmation. The normal flow waits for
that durable pause before publishing an options sheet.

## Wired monitoring and headset actions

Monitoring supports exactly one `.headphones` output, preferring headset mic and
then built-in mic. Bluetooth, AirPlay, speaker, receiver and generic USB routes
are not eligible. Capture starts only in a foreground, eligible lesson after
permission. Existing capture may continue through temporary menus/background;
exit, access loss, completion, route loss or interruption stops it. Manual OFF
persists for the current connection. Only the initial permission-sheet
inactivity cancellation can retry automatically once. No buffers are recorded,
saved or exported. The device-local microphone control spans 0...2, initially
0.25. Its original 0...1 range retains the fourfold microphone-only boost and
the same volume at every saved value. Values above 1 increase the microphone-only
EQ boost, reaching eightfold amplitude at 2 (twice the previous maximum).
The mixer volume remains within 0...1; mute and the default level are unchanged.
Original media bypasses that gain path. Non-finite values use the default; finite
values outside the control range are clamped. Higher gain may distort loud input;
doubling signal amplitude does not promise twice the perceived loudness.

Owner amendment, 2026-09-30: only previously successfully enabled monitoring may
recover after an interruption. The runtime forwards the end notification's
`shouldResume` option; recovery waits for a foreground eligible lesson, a closed
menu, granted microphone permission and the same valid wired connection. Learning
playback remains paused and needs explicit Resume; recovery grants no credit.
The suspended state exposes a cancellable monitoring intent, not active capture.
Manual OFF, unplugging, access loss, completion or exit cancels recovery. An
interrupted first permission request is not established ON intent. Media-services
loss/reset, refused permission or a failed restart requires a manual action; no
retry loop is introduced. Graph invalidation alone cannot restart capture, but
preserves established intent if the session interruption arrives afterward.
If graph invalidation aborts a recovery attempt after the end notification,
another context update cannot reuse that authorization. Explicit manual restart
or a separately permitted later interruption is required.
Already-running monitoring can still continue through ordinary menus/background;
new capture is never started there. This amendment applies to Swift only; the
Expo reference remains unchanged.

Headset play/pause/toggle means the same guarded main action as the visible
control; next-track means an actionable third-cycle Repeat. An owner/revision
gate accepts one press per revision with 0.35-second debounce. Unavailable,
stale, background and menu-open presses cannot confirm. No double-click timer,
silent keep-alive audio or hidden sample player is used.
Each gate transition receives a monotonically increasing, coordinator-owned
revision, including disabling and re-enabling interaction without a database
write. Publication records transitions even without a remote observer; unchanged
reads/publications retain their revision. A rejected queued press cannot consume
a reopened gate, and a pre-transition press cannot become valid again afterward.

## Feedback and launch

`CommittedLearningFeedback` is keyed by the original command ID and derived
from committed source progress, not aggregate XP. Retry, lost replies and failed
recovery pauses preserve a single unpublished event. State reads and restoration
are quiet. Third-cycle Repeat has its own pulse; already-confirmed Next has no additional haptic.
Visual receipts use the original transaction's committed XP award, including a recovered
lost reply, never a difference between language-wide totals. An imported award is not a new
local award. Newly committed completion can show a short visual celebration without
another cycle haptic. Receipts expire, honor Reduce Motion, and stop on inactivity or exit.
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
AppFoundation 26 and LearningMedia 45 tests passed (148 total). The iOS 27 scheme
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

### Owner hardware observations — 2026-09-30

On the installed `ea22154` candidate, the owner reported working learning haptics,
headset buttons, monitoring shutdown on unplugging, and paused learning after
calls/Siri/screen lock. Wired Apple-earphone monitoring was initially inaudible
during remote viewing/debugging; after removing those diagnostic sessions, the
owner confirmed audible monitoring without any gain or product-code change.
The isolated processing graph also passed a synthetic offline gain/mute probe.
These observations do not prove every permission, Repeat, duplicate-credit,
unsupported-route or completion-cleanup edge case. The exact contributor to the
remote-session capture failure was not isolated. Verify microphone audibility on
the physical phone without remote screen viewing; never record or export audio
to collect evidence. At that point, the automatic-recovery change still needed
its own installed-device interruption check. The owner later confirmed Siri
recovery on the separately installed signed Debug candidate, then call/lock-return
recovery and exit cleanup on TestFlight 1.0 (5). Learning remained paused in both
checks; see [cutover acceptance](cutover-acceptance.md).
Permission/gain, unsupported-route, completion and the final PR's
graph-aborted-recovery edge remain separate physical checks, not inferred from
the local regressions.
