# Tap feedback

The unused button sound `button-soft-tick.wav` was supplied by the project owner
on 2026-09-12 as `button_05_soft_tick.wav`. The file is copied byte-for-byte:
stereo 48 kHz PCM16, 100 ms. Button audio was removed at the owner's request on
2026-09-13. This source asset remains untouched but is not loaded or played.

The earlier `tap.wav` is an unused original synthesized UI pop (mono 44.1 kHz
PCM16, 130 ms), reproducible with `node scripts/generate-tap-sound.mjs`.

Buttons and Books, Stages, and Settings tabs now use light native haptics only.
Existing feedback exclusions and rapid-tap suppression remain unchanged. No
button audio player is created. Lesson audio playback is unaffected.
Haptic feel and hardware/system restrictions require physical-iPhone testing.
