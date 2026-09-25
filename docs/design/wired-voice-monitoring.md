# Wired voice monitoring — approved design

Owner approval: 2026-09-21. The first milestone was an on-device native feasibility
prototype. The amendments below define the current feature scope.

Release amendment, 2026-09-25: the owner confirmed physical-device monitoring
works and designated learning monitoring as a normal feature in Debug and
Release. Both the native capability and learning drawer are independent of
`DEBUG`/`__DEV__`. The separate diagnostic lab stays development-only. Wired-only
routing, permission, session ownership, interruption handling and 4x gain remain
unchanged. The drawer describes live wired-earphone monitoring instead of a
development-build restriction.

Owner amendment, 2026-09-21: the owner reports successful simultaneous sample
playback and live headset monitoring on the physical iPhone. The screenshot
confirms headphones/headset input, 44.1 kHz, 5 ms I/O buffer, and reported input
and output latencies of 1.5/18.4 ms; these are not measured round-trip latency.
The approved follow-up doubles the microphone signal only and keeps an already
enabled session alive through temporary menus, app switching, backgrounding and
screen lock. The amended behavior needs a new physical acceptance test.

Second owner amendment, 2026-09-21: the owner confirmed the corrected switch
works and approved 3x microphone amplification plus the learning-options menu
for all sixteen stages. That milestone was development-only; the Release
amendment above supersedes that restriction. Previous 2x/lab-only
boundaries below describe the initial milestones, not the latest target.

Latest owner amendment, 2026-09-21: microphone gain is now 4x. In an eligible
foreground lesson, a wired connection (including one present on entry) enables
monitoring automatically. First use requests microphone permission. Manual OFF
lasts for that connection; unplug/replug or a new lesson permits auto-start again.
This supersedes the original explicit-ON and no-reconnect behavior below.

## Product behavior

- iPhone first, iOS 26+; first physical test uses the owner's iOS 27 iPhone and
  Apple USB-C earphones.
- Live self-monitoring during active practice, including original playback,
  across stages 1–16. No recording, saving, uploading, transcription or scoring.
- Automatically enable on wired connection/lesson entry, only after microphone
  permission. Keep a manual switch; manual OFF lasts until unplug/replug or the
  next lesson. Remember only voice volume locally. Prefer the wired headset
  microphone; otherwise use the iPhone mic.
- Final controls belong in a Voice monitoring learning-options item: switch,
  active input, connection status, independent voice-volume slider.
- Keep already-enabled capture through temporary menus, app switching,
  backgrounding and screen lock. Stop on explicit OFF, actual session exit,
  interruptions, or loss of the supported route. Never start a new session from
  the background or after a delayed permission response there. Reconnection
  permits a new automatic attempt when the lesson is eligible and foreground.
  A first permission grant may retry the prompt-cancelled attempt once. Other
  interruptions/errors require manual ON or a new physical connection.
- The existing 0–100% voice slider controls a microphone-only native +12.0412 dB
  stage (4x signal amplitude), with 0% still muted and original sample gain
  unchanged. This does not promise four times the perceived loudness. Start testing
  at low system volume; strong inputs can clip at high gain.
- Allow only an output reported as wired headphones. Bluetooth, AirPlay,
  receiver, speaker, generic USB audio and ambiguous/mixed routes are blocked.
  Apple USB-C earphones are a test target, not a presumed route classification.
- Lowest practical stable latency is the objective, not a promised numeric
  result. Keep the signal native; preferred I/O buffer duration is not measured
  microphone-to-ear latency.

## Prototype boundary

This section records the original lab milestone. The second owner amendment
adds the development learning menu: a mounted lesson owns the monitoring lease
across transient focus changes. Single-phrase Expo players retain the session,
while a MainActor native configure call avoids resetting active/pending capture
to playback-only. Lesson exit explicitly releases ownership; ordinary lesson
playback and timers retain their existing pause/checkpoint behavior. Temporary
access failure turns capture OFF but permits normal playback after recovery.

Build a development-only lab using the existing local LearningAudio module,
one AVAudioEngine and an explicit switch. Mix a public bundled sample with live
microphone input in that engine; do not send PCM through JavaScript. Do not
change lesson checkpoints, XP, purchase checks, CloudKit or release stage access.
The lab is not yet the final all-stage player integration. It establishes the
audio route, playback coexistence, lifecycle safety and perceptual latency first.

Read-only diagnostics show output/input port kinds, actual sample rate, actual
buffer duration and reported input/output latencies. Never label a sum of these
as a measured round-trip result. Do not log device route UIDs or microphone audio.
If a valid end-to-end measurement cannot be made without extra equipment or
recording, report it as unmeasured; do not add recording to get a number.

Use an identifiable wired output before requesting microphone permission. Check
again after asynchronous permission/session/input changes. A disabled or closed
lab must not restart after a delayed permission response. Keep gain conservative
and bounded; no voice effects, recording, or automatic volume adjustment.

Route and engine changes must mute/stop natively without relying on a JavaScript
callback. Apple does not document a pre-reroute notification guaranteeing zero
samples on another output. Test unplugging explicitly; do not claim a universal
zero-leak guarantee from notification handling alone.

## Acceptance gate

First prove fail-closed routing and lifecycle behavior in automated tests and a
native build. Then test Apple USB-C earphones on the actual iPhone: reported
route, correct microphone, simultaneous sample playback, voice-volume separation,
audible delay, crackling, unplug/replug, lock, app switch and permission denial.
Unsupported generic USB classification stays blocked and is reported to the
owner. Do not broaden the allowlist without a new decision.

Only after physical feedback accepts the prototype should the next development
round integrate the final menu and every-stage learning lifecycle. Existing
learning audio remains unchanged in this milestone.

## Technical evidence

The initial baseline used Expo playback-only audio and disabled microphone
permission configuration. Enabling Expo recording alone also enables Bluetooth HFP and may
default to the speaker. Its shared-session lifecycle can deactivate audio while
no Expo player is active, so the lab must explicitly hand off session ownership
and stop safely on unexpected session/engine changes. The native audio background
mode permits ongoing user-enabled capture; ordinary lesson timers/checkpoints
and Expo playback remain governed by their existing foreground-only rules.

- [Apple headphone port](https://developer.apple.com/documentation/avfaudio/avaudiosession/port/headphones)
- [Apple USB data sources](https://developer.apple.com/documentation/avfaudio/avaudiosessionportdescription/datasources)
- [Audio session preferences](https://developer.apple.com/library/archive/qa/qa1631/_index.html)
- [Microphone selection](https://developer.apple.com/library/archive/qa/qa1799/_index.html)
- [Route changes](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes)
