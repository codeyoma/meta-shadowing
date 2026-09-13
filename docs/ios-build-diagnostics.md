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

This is **not** a warning-free clean-build claim. Before the native-source cleanup
below, regenerating the native project and recompiling dependencies produced 531
warning lines (including repetitions), with no errors. That baseline included
Worklets documentation/deprecation tags,
C++ nullability and narrowing conversions, unused dependency symbols, Swift
Sendable declarations, Expo's generated legacy AppDelegate/iOS 26 lifecycle,
and Apple metadata/archive diagnostics. Addressing those requires dependency
upgrades or separately validated source patches; do not hide them with a global
warning-disable setting or claim the incremental count applies to a clean build.

## Native-source cleanup

The following additional versioned patches fix source diagnostics without
disabling their compiler warnings:

- React Native / Worklets: give documented deprecated compatibility overloads
  their missing `[[deprecated]]` attributes. Worklets' internal memory manager
  calls the existing `runSync` replacement directly; runtime locking is retained.
- Worklets / Reanimated / Gesture Handler: make header-only helper functions
  `static inline`, including helpers used only by Debug assertions.
- Safe Area Context: initialize named edge fields in their generated declaration
  order, preserving every edge value.
- Screens: test a weak reference for existence instead of creating an unused
  strong local binding in the secondary-navigation-bar callback.
- SQLite: the prebuild-generated CocoaPods hook uses `-fno-modules` for only
  `sqlite3.c`. Textual Darwin headers respect SQLite's existing `MIN/MAX`
  definitions, eliminating module-macro ambiguity without disabling that warning
  or editing the vendor amalgamation. Swift and Objective-C modules are unchanged.

`npm run test:native-headers` uses Apple's actual compiler and installed headers
with `-Werror=unused-function`; all five cases failed before their fixes and
passed afterward. Native iOS CI runs this check. Documentation and initializer
diagnostics were additionally reproduced with warning-specific `-Werror` flags
using the original Xcode compilation commands, then rechecked after the fixes.
The sixth native test compiles the real SQLite amalgamation with the generated
file flags and with a negative control: the latter fails on macro ambiguity,
while the configured file passes with `-Werror=ambiguous-macro` still enabled.
No additional warning exclusions or unchecked concurrency annotations are added.

After this cleanup, a fresh clean Release simulator build succeeded with 328 raw
warning lines (including repetitions), down from 531. The app launched and retained
its existing 25 XP sample history. Core (239), build-settings (6), and native
compiler (6) tests passed. A separate read-only code review found no actionable
issues. Remaining warnings include vendor integer narrowing, nullability,
compatibility deprecations, Sendable diagnostics, and generated/toolchain output;
they are not claimed fixed or hidden by these patches.

## Risk-based follow-up

The owner requested fixing substantive problems, not making the warning count
zero. No new global or per-dependency warning suppression is introduced.

- Gesture Handler: the pan recognizer's delayed activation action shared the
  selector of its `CGFloat activateAfterLongPress` property getter. Reading that
  property could activate the gesture and return an invalid floating-point value.
  Rename only the action and all scheduling/cancellation references; preserve the
  public configuration, stored delay, and setter. The app does not currently use
  delayed long-press activation, so this is a latent defect, not a reproduced user
  failure. A compiler regression check on the real implementation fails before
  the fix with `-Werror=mismatched-return-types` and passes afterward.
- Expo Fetch: preserve Apple's `@Sendable` redirect-completion-handler contract
  through both delegate declarations and the response implementation. This makes
  the existing transfer to the response queue correctly typed without changing
  redirect policy or adding unchecked conformance.

Reviewed warnings left unchanged:

| Category | Disposition |
| --- | --- |
| Empty generated archive objects, unused compatibility symbols, missing AppIntents metadata, duplicate C++ link flag | Build/toolchain noise; not evidence of a runtime failure. |
| Slider `discreteValue:` / Constants `deviceYear` missing implementations | Unused wrapper/legacy declarations; actual slider calls use the implemented inner slider. Do not invent implementations. |
| Tabs `None` switch case | All inspected callers exclude `None`; conversion has a trailing fallback. |
| Gesture Handler variable-length arrays | Current Apple Clang extension; tracked pointer arrays are bounded and event buffers are sized for their writes. |
| Reanimated child-index narrowing | No reachable failure found at realistic sibling counts on this target. A cast alone would not improve safety. |
| Vendor SQLite narrowing / compatibility deprecations | Leave vendor algorithms intact; do not treat all narrowing warnings as proven harmless or rewrite casts solely to silence them. |
| Crypto MD2/MD4/MD5 availability | Dependency compatibility API; the app's package-integrity path selects SHA-256, not these algorithms. |
| Exception subclasses restating inherited unchecked conformance | Inspected subclasses add only computed messages or immutable payloads; no subclass-specific defect found. Do not infer that the mutable base class is universally thread-safe. |
| Expo UI symbol-effect availability | Dependency targets older iOS versions than this iOS 26+ app; no current deployment-path failure found. |

### Not classified as harmless: audio ownership

`AudioPlayer` and `AudioPlaylist` retain their non-Sendable capture warnings.
The seek callback reads mutable status fields also accessed by JavaScript setters
and native observers. No app failure has been reproduced, but thread safety has
not been established. The app uses `AudioPlayer`, not `AudioPlaylist`.

Moving the status update after `await` alone would only silence the capture while
leaving access on the generic executor. Blanket `@unchecked Sendable` or
`@MainActor` would similarly conceal or conflict with existing ownership. A
separate ownership correction needs native Thread Sanitizer coverage of seek,
rate/status updates, replacement and release; JavaScript unit tests are not proof
of Swift race safety. Keep these diagnostics visible until that work is verified.

Follow-up verification: a clean Release simulator build succeeded and the app
launched with its existing 25 XP. The pan return-type and Fetch completion-handler
capture diagnostics are absent; both audio capture diagnostics remain visible.
The log contains 322 raw warning lines (including repeated diagnostics), not zero.
Core (239), build-settings (6), native compiler (7), and TypeScript checks passed.
The compiler tests cover the real pan implementation and generated SQLite flags;
they do not claim runtime coverage of delayed gesture timers or native audio races.
All eight versioned patches match the installed sources, and an independent
read-only review found no actionable defect in this follow-up. These local
results do not represent remote CI verification of this follow-up.
