# Shared playback-rate control

## Current layout — 2026-09-13

The owner subsequently renamed the heading to “배속”. The shared control now
places the value to the right of the slider and uses four dots instead of numeric
scale labels. See [current settings verification](settings-verification.md).

## Historical verification — superseded layout

Owner amendment, 2026-09-12: use “재생 속도” consistently and reuse the Learning
Settings layout in every rate editor.

`PlaybackRateControl` is shared by Learning Settings and the paused player
options drawer. It retains the centered live value, native slider, endpoint
labels and proportional 1×/2× ticks. The preference and session retain separate
save behavior, including reset/remount on save failure.

Verification on iPhone 17 Pro Max, iOS 26.5 Simulator, Release build:

- Settings and drawer both visibly show the shared title and layout.
- Drawer slider changed from 1× to 1.65×; closing and reopening retained 1.65×.
- The live label and native accessibility value matched the selected rate.
- Restored the session to 1× after testing. No cycle-confirm action was used.
- `npm run check`: 67 tests passed; TypeScript passed.
- Native VoiceOver increment/decrement behavior was not established by the
  simulator automation; the attempted AX action did not change the value.
  This is not a physical-device or full accessibility acceptance claim.

Follow-up owner amendment: all rate adjustments use 0.25× steps across the
0.25–3× range, including accessibility actions. Existing saved rates remain
readable and are not migrated just by opening a screen.

The follow-up Release rebuild succeeded, including the player-header accessible
name. Simulator Settings taps selected 1.75× and 1.25×, then restored 1×.
`npm run check` again passed all 67 tests and TypeScript. Full VoiceOver and
physical-device acceptance remain unverified.
