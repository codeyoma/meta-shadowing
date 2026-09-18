# iOS 27 scene lifecycle

Apps built with the iOS 27 SDK must adopt UIKit's scene lifecycle. The old
AppDelegate-only startup traps before JavaScript loads; a successful Xcode build
does not establish launch compatibility.

This app keeps its iOS 26+ deployment target and uses Expo 57.0.23's
`EXExpoAppSceneDelegate` for window creation, React Native startup, lifecycle
notifications and link forwarding. The SDK 57 bare template still uses legacy
startup, so `plugins/with-ios-build-settings.js` registers one window scene and
adds `ExpoReactNativeFactoryProvider` conformance during prebuild. It removes
only the known legacy window/start block and fails if the template changes.
Do not start React Native from both delegates or add a scene manifest without
the factory-provider conformance.

`npm run test:build-settings` checks the generated manifest, migration and
repeatability. After changing Expo or the template, regenerate iOS, rebuild the
native app and verify cold launch, background/foreground and navigation on a
device. Recheck URL launch/notification behavior when using those entry points.
Do not claim downloaded package delivery from build or launch success alone.

Private asset-pack configuration is separate. Preserve the owner's local
environment when prebuilding an internal download-test build; the regular
build must continue to omit the private free-test descriptor and assets.

Reference: [Apple's scene lifecycle migration guide](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).

## Verification — 2026-09-16

- Physical iPhone 16 Pro Max, iOS 27.0, Xcode 27 SDK: native Debug build,
  data-preserving update installation, launch, home/foreground transition and
  terminated-process relaunch passed. The prior no-scene startup trap no longer
  occurs. Existing progress and installed samples remained accessible.
- An owner-provided private test asset pack downloaded through Background Assets
  using Apple's local test server. The app showed its learning action and opened
  the first lesson. All 560 audio files copied back from the device matched the
  expected byte counts and SHA-256 hashes; manifest bytes and ready marker matched.
  No confirmation taps, XP rewards or completed runs were added.
- 260 core, 8 build-settings, 3 private-package preparation/policy and 7 native
  header tests passed. Typecheck, iOS Hermes export, dependency alignment and all
  21 Expo Doctor checks passed. Upstream native compiler warnings remain; this
  is not a warning-free-build claim.
- Limits: this was a Metro-connected Debug build and a local asset server, not
  App Store/TestFlight hosting acceptance or a standalone offline cold launch.
  Audio file integrity and lesson entry were verified, not human listening
  quality, Bluetooth interruptions or every learning stage. iOS 26 runtime and
  deep-link/notification entry paths were not re-tested in this run.

Private source files, raw device logs, certificates and backup copies remain
ignored and are not part of this change.
