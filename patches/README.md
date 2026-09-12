# iPhone playback rate

The owner requested 0.25–3× playback. expo-audio 57.0.4's iOS `setPlaybackRate`
clamps to 2× before passing the rate to AVPlayer. The versioned patch changes only
that upper bound to 3×. Application validation still rejects non-finite values
and values outside 0.25–3. The Android implementation is unchanged.

`npm ci` runs `patch-package --error-on-fail`. If installation deliberately skips
scripts, run `npm run postinstall` before building. Rebuild the native iOS client;
Expo Go cannot load this patch. On expo-audio upgrades, review the native rate
implementation and repeat playback verification; do not silently drop the patch.
