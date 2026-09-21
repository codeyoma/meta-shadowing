# Wired monitoring prototype verification

Development builds now include both the lab and a learning-options integration.
Release capture remains disabled. No recording, saving, uploading or scoring
is implemented. No microphone audio is included in logs or test artifacts.

## Publication checkpoint — 2026-09-21

PR CI exposed a Swift 6 concurrency compile error in the configuration-change
observer under Xcode 26.6, before the LearningAudio tests ran. The notification
callback captured a non-Sendable engine and transferred it into MainActor.
The engine is now captured only by an explicit `@MainActor @Sendable` action;
the notification callback invokes that action on its existing main queue. Weak
ownership, the current-graph identity guard and stop/invalidation behavior remain
unchanged. No concurrency checking, tests or production safety gates were disabled.
Local Xcode 27 Debug and Release LearningAudio test schemes and `npm run check`
pass after this fix. The pinned Xcode 26.6 result must be confirmed by the new CI run.

Fresh pre-PR verification passes `npm run check` (412 domain tests, 22
build/package checks and TypeScript) and the iOS LearningAudio simulator test
scheme. The staged whitespace and privacy checks pass; no device logs or private
assets are included.

The learning options sheet opens fully expanded. Monitoring controls use the
shared settings style, volume tick marks and live percentage feedback. Volume
and playback-rate persistence prefer the last displayed value over a differing
release event. The owner still reports visible thumb movement on release;
eliminating that visual movement remains an open UI follow-up, not a verified
fix in this publication checkpoint. Physical transport and safety checks below
remain pending where explicitly noted.

## EarPods double-press repeat — 2026-09-21

Owner-approved mapping: the iOS next-track command (quick double-press on wired
EarPods) invokes the existing Repeat action after cycle-three playback ends.
It confirms that cycle and starts cycle four, adding exactly two planned cycles.
Single-press still invokes Confirm/Next. Repeat and main consume one shared
action revision, so duplicate or delayed commands cannot count extra progress.
Playback, menu/background, error/access gates, cycles four/five, and stages 11–16
cannot repeat. No new learning-state or XP algorithm is introduced.

Actual EarPods command delivery still needs an owner device check: after third
audio ends, double-press should stay on the same phrase and show five nodes with
the fourth cycle starting. Repeat the gesture during audio/menus and on cycle
five to verify no skip, extra cycles or other music-app playback. Control Center
next-track is intentionally the same action while this app owns transport.

Verification: 406 domain tests, 22 build/package checks and TypeScript pass.
Native iOS fixtures pass 24 tests in both Debug and Release. The signed physical
device build and in-place installation pass. Independent scoped review found no
Important/Critical issues. Existing SDK/build warnings remain; these automated
checks do not prove physical double-press dispatch or music-app suppression.

## Automatic wired activation — 2026-09-21

The latest owner-approved behavior supersedes the older manual-only milestones
below. An eligible foreground lesson automatically enables live monitoring when
wired headphones are connected, including lesson entry with an existing wired
connection. The lab remains manual. First use requests microphone permission;
the permission-sheet cancellation can retry once after grant and foreground
return. A native invalidation version prevents mistaking an audio interruption
for that permission-sheet cancellation.

Manual OFF stays OFF through menu and foreground changes until physical
disconnect/reconnect or a new lesson. Exit/completion stops capture. Background
does not initiate capture, while an already-running session continues. Release
and denied/missing permission remain inert; the wired allowlist is unchanged.
Only voice gain persists. No XP, checkpoint or original-audio changes.

Automated policy tests cover entry/connection, manual OFF, unavailable routes,
foreground/readiness deferral, lease cancellation, late permission responses,
and interruption suppression. Physical auto-connect and permission-sheet timing
still require owner testing. Start at low system volume before entering a lesson
with earphones attached; check OFF then menu return, unplug/replug, lesson exit,
background reconnect followed by foreground return, and simultaneous original
audio. The sections below are historical verification, not proof of this change.

Verification: 404 domain tests, 22 build/package checks and TypeScript pass.
Native iOS fixtures pass 22 tests in both Debug and Release. Signed device build,
signature verification, in-place installation and root launch pass. Read-only
physical runtime status reports permission granted, monitoring OFF and no allowed
wired output at the time of inspection. The agent did not start capture.
Independent review found and prompted regression fixes for deferred-start loss
and permission/interruption ambiguity; scoped re-review found no remaining
Important/Critical issue. These checks do not replace physical auto-connect tests.

## Fourfold gain and headset confirmation — 2026-09-21

The latest owner amendment increases microphone gain from 3x to 4x (+12.0412 dB).
Original audio bypasses that gain stage and 0% remains muted. Synthetic offline
rendering checks mic/sample mixing at full, half and zero gain. Start physical
retesting at low volume; amplification does not guarantee unclipped loud speech.

The lesson now registers iOS play/pause/toggle handlers and generic Now Playing
metadata, with a non-mixable active session. Commands use the existing footer
action, not a separate skip/XP path. Native owner/action tokens, monotonic receipt
time, single-consumption and debounce guards reject stale/duplicate inputs. Both
native and JavaScript gates require foreground wired use; menus, playback,
reveal-in-progress, loading and errors cannot advance learning. Commands received
while gated are consumed without changing playback. Exit/completion removes the
handlers and metadata. Explicit mic OFF and focus/foreground return restore
transport ownership, without restarting microphone or lesson playback. Review
identified and corrected the mic-OFF session-deactivation ownership loss.

Automated verification: 393 domain tests, 22 build/package checks and TypeScript;
22 native iOS tests in Debug and Release. The 4x rendering regression failed on
the old gain. Signed device build and in-place installation succeeded. Microphone
activation and headset clicks were not performed by the agent.
On the updated physical-phone runtime, the sample lesson reached speaking with
no audio error, its monitoring lease remained open, remote startup resolved and
the remote action was armed. Microphone status was OFF. This verifies startup,
not delivery of a physical earphone button command.

Remaining device checks: first leave a music app paused, enter learning with
Apple USB-C earphones and click once after the original ends. Confirm exactly one
footer action/XP award and no music-app playback. Repeat with mic OFF, after a
menu round trip, in silent stages 11–16, and after app switching. Clicking during
original playback, a menu or background must not advance; unplugging, interruption
and exiting must retain their existing safety behavior. iOS can give another app
Now Playing ownership; these checks are not proven by unit tests or registration.

Reference: [Apple remote player events](https://developer.apple.com/documentation/mediaplayer/handling-external-player-events-notifications).

## Learning menu and 3x gain — 2026-09-21

After confirming the corrected switch works, the owner approved learning use.
Stages 1–16 now expose **학습 옵션 → 내 목소리 듣기**, with an explicit switch,
connection/input status and independent voice-volume slider. Native microphone
gain is 3x (+9.5424 dB), with zero still muted and original audio unchanged.
Only gain persists; new lessons start OFF. Existing capture survives temporary
menus, background and lock, but lesson exit/completion, profile replacement,
interruption and unsupported routes stop capture. Temporary access loss stops
capture without permanently closing the ordinary playback lease; recovery does
not enable the microphone automatically.

The player uses Expo's keep-session-active option for single phrase handles.
Native MainActor playback configuration preserves active/pending monitoring;
the normal original-audio playlist, rates, seeking and checkpoints remain in
use. Original lesson playback/timers still pause on background and menu entry.

Verification: `npm run check` passes 388 domain tests, 22 build/package checks
and TypeScript. Native fixtures pass 17 macOS tests and 18 iOS tests in both
Debug and Release. The synthetic render test verifies 3x voice, unchanged
sample and true mute. Signed device build and in-place installation pass.
Independent review's access-recovery finding was fixed and re-reviewed with
no remaining Critical/Important findings. No microphone was enabled by the agent.

Device retest: enter an unfinished lesson, open the menu above, connect Apple
USB-C earphones, lower system volume, then enable. Close the menu and resume
original audio; confirm both voices are audible, including at phrase endings
and grouped transitions. Check stages 11–16 (silent word reveal), menus,
background/lock, explicit OFF, lesson exit, and unplug/reconnect. This new
integration and louder gain are not yet physically accepted. Keep Metro running
on the same Wi-Fi; the installed development build is not standalone/offline.

## Owner device feedback and amended behavior — 2026-09-21

The owner reports that live voice and sample playback work on the physical
iPhone with Apple USB-C earphones and accepts the prototype audio test. The
provided screen shows headset input/headphone output, 44,100 Hz, 5.0 ms buffer,
1.5 ms reported input latency and 18.4 ms reported output latency. These values
do not establish measured round-trip latency or all interruption/unplug cases.

The follow-up adds a microphone-only native 2x gain stage, preserves 0% mute,
and keeps existing monitoring through menus/inactive/background/lock. Explicit
OFF, session exit, interruption, unsupported routes and module destruction
still stop it. Pending permission/queued enables are cancelled on inactivity.
Normal lesson playback, progress, XP and timers are unchanged; this remains the
development lab, not production player integration.

The louder/background behavior needs a new device retest. Lower system volume
before enabling; check quiet and loud speech, distortion, sample balance,
app switching/lock, explicit stop, and unplug/reconnect without automatic restart.

Follow-up automated checks: 384 domain tests, 22 build/package checks and
TypeScript pass. Native fixtures pass 16 tests on macOS and 17 on iOS in both
Debug and Release. The new offline render test uses synthetic stereo buffers
to verify doubled microphone gain, unchanged sample gain and 0% mute. State
tests verify that inactivity keeps active monitoring but cancels pending/queued
enables; the navigation regression keeps temporary menus inside the session
and stops/restores audio when navigating out. These tests do not prove physical
background continuity or louder-speech quality on the earphones.

The amended signed Debug build installed in place on the connected iPhone and
launched without a one-time Metro-address override. Its built Info.plist includes
the audio background mode. This local development installation still requires
the same Wi-Fi as the running Mac development server; it is not a standalone
offline build. No microphone was enabled by the agent during installation.
Independent read-only review found no new Critical/Important issue; physical
continuity, loudness/clipping and unplug behavior remain the retest gate.

## Original prototype evidence (2026-09-21, before amendment)

- Baseline: 377 domain tests passed before changes.
- `npm run check`: 383 domain tests, build/package checks and TypeScript pass.
- LearningAudio macOS fixture: 13 tests pass.
- LearningAudio iOS 27 simulator fixture: 14 tests pass with Swift 6 strict
  concurrency, including blocked capture, cancellation, gain and sample-path
  validation. Existing AVFoundation fixtures emit platform/decoder diagnostics;
  no test failures. A simulator is not evidence of microphone-to-ear latency.
- Final full app Debug and Release simulator builds pass. Third-party/native
  dependency warnings remain; no LearningAudio warning/error was reported.
- Final Release native fixture: 14 tests pass, including the cancellation fixes.
- Simulator lab shows unsupported output, microphone off, gain 25% and empty
  latency diagnostics. No microphone permission was requested in this check.
- Independent review identified a queued-enable-after-disable race. The bridge
  now reserves intent before dispatching asynchronous work; regression tests
  cover queued disable and permanent module-lifetime invalidation.
- After using the lab's recovery/close action, the ordinary Morning Notes
  stage-1 player reached its manual confirmation state without an audio error.
  No confirmation was tapped and no XP was intentionally awarded. This verifies
  the simulator playback flow, not physical headphone sound quality.

## Deferred minor

Graph configuration observers accumulate across toggles until module destruction.
Their captures are weak and stale callbacks cannot operate an old graph. Per-graph
observer removal is a deferred development-lab resource-cleanup improvement.

## Device procedure — repeat for amended behavior

1. Use a Development build containing the updated local LearningAudio module
   and microphone purpose string. Expo Go/JavaScript reload alone cannot add
   this module. Preserve installed data; do not replace a differently distributed
   app without the owner's approval.
2. Cold-launch the development route `metashadowing://monitoring-lab`. Do not
   navigate directly from an actively playing lesson in this first experiment.
   The lab installs/verifies only the existing public Morning Notes sample.
3. Connect Apple USB-C earphones. Inspect output status before enabling. Generic
   USB is intentionally unsupported, even if the connector is physically wired.
   If blocked, report that result; do not bypass the allowlist.
4. Start at low system volume and the default 25% voice gain. Enable explicitly
   and grant microphone permission yourself. A permission dialog may cause an
   inactivity stop; if so, enable again after returning. Verify the displayed
   input (headset preferred, built-in fallback), hear your voice, then start the
   sample and speak simultaneously. Adjust voice gain independently.
5. Check audible delay, distortion/crackling, echo and comfortable volume. The
   displayed buffer/input/output values are diagnostics, not measured round-trip
   latency. True round-trip latency is **unmeasured** until separately measured
   without adding microphone recording to the app.
6. Lock/unlock and switch apps while monitoring: existing capture must continue.
   Open/close temporary menus without stopping capture. Then unplug while
   speaking/sample playback, reconnect, interrupt with a call, leave/reopen the
   lab, and reload the development app. Those events must stop capture and keep
   it off. Confirm gain persists but enable intent does not.
   Apple route notifications cannot establish a zero-leaked-samples proof;
   document the observed unplug result without claiming a universal guarantee.
7. Close the lab and play a normal sample lesson. Check audio, checkpoint and XP
   remain correct. On a restore error, use the lab's audio-recovery action or
   reenter the lab to retry cleanup; do not resume microphone automatically.

## Remaining gate

### Switch activation regression

The owner reported that the switch would not turn on after the background
amendment. The navigation guard was interpreting Expo Router 57's internal
`__root` wrapper as a session exit, permanently closing the visible lab before
its first enable tap. The screen now subscribes to its actual navigator state;
the guard also unwraps Expo's shell before evaluating the active app route.
A regression reproduced stop/restore instead of enable before the fix and passes
after it. `npm run check` passes 385 domain tests, 22 build/package checks and
TypeScript. The phone app was relaunched with the updated Metro bundle without
enabling the microphone. Audible switch activation still needs the owner's retest.

Apple USB-C headphone/headset classification and audible simultaneous monitoring
are confirmed by owner feedback. The new boost/background behavior, interruption
and unplug safety need a retest; true round-trip latency remains unmeasured.
The new learning-menu integration and 3x gain require the device retest above.

### Lesson-entry playback regression

The owner reported the lesson's audio-unavailable message after the monitoring
menu integration. Device runtime inspection found a closed monitoring lease
while the player route was active. A regression reproduced this by delivering
the previous tabs navigation snapshot before the new player snapshot: audio
preparation failed with `Monitoring session has ended.`

Navigation now waits until the session observes its home route before treating
another route as an exit. Explicit `beforeRemove` and unmount cleanup still
close a session even before that first snapshot. A second regression covers
removal while ownership acquisition is pending, preventing late activation.

Fresh verification: `npm run check` passes 390 domain tests, 22 build/package
checks and TypeScript. After the JavaScript update, the connected phone reports
an open, owned player lease and no audio error, with stage 1 in its speaking
phase. Native microphone status remains off; no microphone was enabled and no
confirmation/XP action was performed during this check. Audible original audio
and simultaneous headphone monitoring still require the owner's retest.
