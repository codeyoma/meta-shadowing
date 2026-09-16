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

## Verification

`npm run check` covers durable cycle mapping and retry/restore behavior. A native
iOS build is required after installing this module (`cd ios && pod install`).
Simulator verifies bridge loading and silent unsupported
hardware behavior; it **cannot verify physical haptic feel**.

On iPhone: compare all five cycles and Repeat, leave
mid-pattern and foreground again, and check that lesson audio remains continuous.
Confirm that the optional feedback is brief and comfortable during repeated study.

References:
- [Apple HIG: Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)
- [Core Haptics engine](https://developer.apple.com/documentation/corehaptics/chhapticengine)
- [Haptics-only engine](https://developer.apple.com/documentation/corehaptics/chhapticengine/playshapticsonly)
- [Audio session initializer](https://developer.apple.com/documentation/corehaptics/chhapticengine/init(audiosession:))
