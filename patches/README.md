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

# Native sheet dragging and Expo popup menus

The expo-modules-core 57.0.18 window-level `SystemMenuTouchGate` accepts all
events, even when no context menu is open. In the app, this prevents UIKit's
dictionary form sheet from dragging interactively. Disabling only that gate
restored the native gesture; changing detents or removing dictionary content
did not fix it.

The versioned patch makes the gate a non-competing observer: it can neither
prevent nor be prevented by another recognizer. Its existing event filtering and
protection against React Native press-through remain in place while a menu is
open. The dictionary uses UIKit's grabber instead of an app-owned
release-only drag handler. Rebuild the native client after applying this patch.

The learning-dictionary native fixture compiles the installed gate source and
tests non-competing gesture behavior and menu detection. On Expo
upgrades, repeat dictionary/menu drawer dragging and font-popup selection/outside
tap checks before removing or updating the patch.

The current font popup can pass an outside tap to a size stepper with both the
original and patched arbitration. That separate behavior is recorded in
`docs/learning-dictionary-verification.md`; this patch does not expand the
upstream context-menu detector or claim to fix every popup presentation.

In this pinned Expo version, active-menu filtering uses
`handler.ignore(touch, for: event)` from both the event delegate and
`touchesBegan`. The gate then sets its own state to `.failed`; it does not
recognize successfully and win against React Native's recognizer. The patch
leaves that filtering path unchanged. Restoring gesture prevention is therefore
not a replacement for fixing a popup that the upstream detector does not see.
