# Learning haptics

iPhone-only local Expo module. Core Haptics plays short transient events after a
successful learning checkpoint save. The JavaScript domain observer owns the
cycle-to-rhythm mapping; the native player validates and schedules the whole
pattern, with no JavaScript timers between taps.

| Confirmation | Rhythm |
| --- | --- |
| Cycles 1 and 4 | Medium, strong |
| Cycle 2 | Medium, medium, strong |
| Cycles 3 and 5 | Medium, medium, strong, weak |
| Choose two additional cycles | One medium tap, replacing cycle 3's pattern |

Starting tuning: 80 ms spacing; intensities 0.45 / 0.70 / 0.25; sharpness 0.5.
These are design choices from the supplied diagrams, **not Apple-prescribed
values**. Physical-device testing is required to tune the perceived rhythm.

- No feedback for playback ending, restoring, duplicate saves or failed saves.
- A successful save retry emits once. Already-confirmed Next emits no second tap.
- No extra success/notification haptic is layered over cycle confirmation.
- A haptics-only engine with a nil audio session leaves lesson audio routing alone.
- Hardware support and foreground state are checked natively. Unsupported devices
  and engine failures remain silent; learning and visual feedback still work.
- Only one pattern plays at a time. Leaving learning, backgrounding, disabling
  feedback, reset and interruption discard the pattern; no delayed replay.
- The visible haptic settings menu was removed at the owner's request. The native
  device-local preference bridge remains; fresh installs enable app feedback by
  default. It does not change iOS-native control feedback or cloud settings.

## Launch animation

Launch feedback always accompanies the launch animation; there is no app-level
switch. Obsolete launch and learning preferences do not suppress it. Learning
feedback retains its existing behavior. System availability and interruption
handling still apply; the app does not override iOS accessibility settings.

The unmodified `talking-pup-512.webp` plays once for 2.4 seconds. Mouth-opening
frames start at 0.24, 0.66, 0.89, 1.39 and 1.81 seconds; a fixed Core Haptics pattern
uses five transients with intensities 0.90, 0.60, 1.00, 0.90 and 0.60, all with
sharpness 0.15. At the owner's request, intensity parameters were doubled from
0.45, 0.30, 0.55, 0.45 and 0.30, capped at Core Haptics' maximum of 1.0. This does
not guarantee twice the perceived strength. Closing frames and the final hold
are silent. These are device-tuning values, not Apple-prescribed values. After the
owner reported no perceptible launch feedback, device debugging confirmed hardware support, one
pattern start, and normal cleanup after the final pulse, without an early stop.
Only intensity was increased; timing and sharpness were preserved. Physical
perception still requires owner confirmation and is not proven by these traces.

The launch engine prepares while artwork loads, then the whole pattern starts
after the native image playback command completes. There are no JavaScript timers
between haptic events. Image playback and Core Haptics use separate native clocks;
their perceived alignment still needs checking on iPhone. The launch player is
separate from the learning player, so launch cleanup cannot stop learning feedback.

Reduce Motion skips both animation and launch haptics. Load failures/timeouts do
not trigger feedback. Completion, unmount, native inactivity, backgrounding and
image failure stop the launch pattern. Returning to the app never replays an interrupted
launch; waiting longer for fonts never repeats it. Unsupported hardware and haptic
errors are silent and never block the app. No audio is added or routed.

## Verification

`npm run check` covers durable cycle mapping and retry/restore behavior. A native
iOS build is required after installing this module (`cd ios && pod install`).
Simulator verifies bridge loading and silent unsupported
hardware behavior; it **cannot verify physical haptic feel**.

Launch component tests also cover obsolete opt-outs, Reduce Motion, slow loading, lifecycle
cancellation, late animation callbacks and native haptic failures. The native
pattern runs without haptic hardware:

```sh
xcodegen generate --spec tests/learning-haptics/project.yml
xcodebuild -project tests/learning-haptics/LearningHapticsTests.xcodeproj \
  -scheme LearningHapticsTests -destination 'platform=macOS,arch=arm64' test
```

On iPhone, cold-launch the app. Check the five mouth openings,
comfort after repeated launches, silence during closing/final hold, and immediate
stop when opening Control Center or leaving the app. Confirm Reduce Motion stays
silent and that returning never replays. Engine scheduling tests do not prove the
perceived intensity, sharpness or visual alignment on hardware.

On iPhone: compare all five cycles and Repeat, leave
mid-pattern and foreground again, and check that lesson audio remains continuous.
Confirm that the optional feedback is brief and comfortable during repeated study.

References:
- [Apple HIG: Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)
- [Core Haptics engine](https://developer.apple.com/documentation/corehaptics/chhapticengine)
- [Haptics-only engine](https://developer.apple.com/documentation/corehaptics/chhapticengine/playshapticsonly)
- [Audio session initializer](https://developer.apple.com/documentation/corehaptics/chhapticengine/init(audiosession:))
