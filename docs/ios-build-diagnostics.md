# iOS build diagnostics

The React Native 0.86.3 patch is applied by `patch-package` on `npm ci`.
Re-evaluate it when upgrading React Native, Expo, Hermes, or Worklets.

## Compiler diagnostics

`plugins/with-ios-build-settings.js` configures app targets during Expo prebuild:

- `HERMES_GLOBALS_FILE` points to the explicit declarations in
  `scripts/hermes-globals.js`. These describe runtime-installed names and
  optional browser/development globals inspected by dependencies. They are
  compiler input only, not runtime polyfills or bundled code. Unknown names
  continue to warn.
- `HERMES_ALLOW_GLOBAL_EVAL=1` disables only Hermes' `direct-eval` diagnostic for
  the app bundle. Expo's split-bundle loader and Worklets' release unpacker
  deliberately evaluate global code, not lexical local variables. This category
  is bundle-wide, so new application code must not rely on lexical `eval`.
  Unconfigured builds retain the diagnostic. No blanket `-w` is used.

`npm run test:build-settings` runs the actual installed Hermes compiler through
React Native's bundling script. It checks bytecode output, intended globals/eval,
unknown-name diagnostics, syntax failures, and cache-reset behavior. It also
introspects Expo prebuild configuration using an isolated temporary native root.

## Build scheduling and platform metadata

- Metro reuses its normal dependency-aware cache. Set `RESET_METRO_CACHE=1` in
  the build environment for an explicit reset; cache-reset messages remain
  visible when requested.
- Hermes' Debug/Release replacement phase is explicitly always out of date.
  Its own configuration/version guard decides whether replacement is needed.
  Declaring fake outputs could incorrectly skip a configuration switch.
- The deprecated `UIRequiresFullScreen=false` key is omitted for the current
  iPhone-only iOS 26+ configuration. Supported orientations are unchanged.
  Explicit fullscreen and iPad configurations are not overridden.

After changing these settings, regenerate the native project and install Pods
using the same local delivery/CloudKit environment as the existing build, then
run a Release simulator build. Do not commit generated projects or local logs.

## Verification scope and remaining warnings

The recurring 47 diagnostics from the previous incremental Release build are
absent after these changes. The next incremental Release build succeeded with
zero warnings, and the installed app retained its existing learning history.

This is **not** a warning-free clean-build claim. Regenerating the native project
and recompiling dependencies produced 531 warning lines (including repetitions),
with no errors. These remain visible: Worklets documentation/deprecation tags,
C++ nullability and narrowing conversions, unused dependency symbols, Swift
Sendable declarations, Expo's generated legacy AppDelegate/iOS 26 lifecycle,
and Apple metadata/archive diagnostics. Addressing those requires dependency
upgrades or separately validated source patches; do not hide them with a global
warning-disable setting or claim the incremental count applies to a clean build.
