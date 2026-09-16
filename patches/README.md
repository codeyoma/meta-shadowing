# iPhone playback rate

The owner requested 0.25–3× playback. expo-audio 57.0.5's iOS `setPlaybackRate`
clamps to 2× before passing the rate to AVPlayer. The versioned patch changes only
that upper bound to 3×. Application validation still rejects non-finite values
and values outside 0.25–3. The Android implementation is unchanged.

`npm ci` runs `patch-package --error-on-fail`. If installation deliberately skips
scripts, run `npm run postinstall` before building. Rebuild the native iOS client;
Expo Go cannot load this patch. On expo-audio upgrades, review the native rate
implementation and repeat playback verification; do not silently drop the patch.

The same expo-audio patch now covers the AVQueuePlayer-backed playlist used for
multi-sentence learning units: a 3× upper bound/default rate, exact seek tolerance,
explicit pause/interruption events, failed-item and media-services-reset errors,
and current-item timestamps during transitions. The JS adapter depends on the
`playbackInterrupted` event field to distinguish interruptions from ordinary
queue advancement. Original audio files are queued without export or merging.
`src/core/playlist-native-contract.test.ts` guards these native event contracts;
`playlist-audio.test.ts` verifies cumulative timeline and cycle behavior.

# iPhone tab image sizing

The custom mascot requests a 36-point image, but React Native's bundled-asset
loader can return its original 1254-point UIImage in a standalone Release build.
The tab bar's subsequent layout pass does not constrain it, so the image covers
the other tabs. The react-native-screens 4.26.2 patch bounds custom tab images to
their requested size before assigning them to UIKit. It only shrinks oversized
images, preserves aspect ratio and rendering mode, and leaves SF Symbols and
asset-catalog icons on their existing paths. Original brand files stay unchanged.

Rebuild the native client after applying this patch; a JavaScript reload is not
enough. On react-native-screens or React Native upgrades, check the native asset
loading path and repeat a standalone Release cold launch with the original
mascot. Verify all browsing tabs remain visible and tappable and the mascot
remains inert. Remove the patch only when the upstream path respects image size.
