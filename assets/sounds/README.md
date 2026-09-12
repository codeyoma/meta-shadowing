# Tap feedback

The active button sound is `button-soft-tick.wav`, supplied by the project owner
on 2026-09-12 as `button_05_soft_tick.wav`. The file is copied byte-for-byte:
stereo 48 kHz PCM16, 100 ms. The application plays it at 65% player volume,
independently of lesson audio. The original supplied file remains untouched.

The earlier `tap.wav` is an unused original synthesized UI pop (mono 44.1 kHz
PCM16, 130 ms), reproducible with `node scripts/generate-tap-sound.mjs`.

Button feedback uses a light native haptic and this single reusable sound.
Books, Stages, and Settings tabs also play it. The player footer is haptic-only;
options/settings/language controls, the decorative mascot, and disabled buttons
are silent. Rapid taps
do not create overlapping players. Backgrounding cancels pending playback and
releases the feedback player; foregrounding preloads it without playing anything.
Haptic feel and hardware/system restrictions require physical-iPhone testing.
