# W2 standalone Swift foundation verification

Scope: #93. This records local verification of the synthetic native shell, not
feature parity, a physical-device replacement or a hosted CI result.

## Environment and results

Verified with Xcode 27.0, Swift 6.4, XcodeGen 2.46.0 and a dedicated iPhone 17
Simulator running **iOS 27.0**, per the owner's request. The generated app retains
an **iOS 26.0** deployment minimum. No performance benchmark was collected.

| Check | Local result |
| --- | --- |
| XcodeGen standalone generation | Passed without Expo, CocoaPods or Metro |
| Debug build and launch | Passed on iOS 27 |
| Release build and launch | Passed on iOS 27 |
| `LearningDomain` Swift Testing | 3 tests passed, including parameterized schema/content validation |
| `AppFoundation` Swift Testing | 10 tests passed: scoped storage, corruption, cancellation, retry and stale-result rejection |
| XCUITest | 3 passed: library/detail/back/foreground/relaunch; largest accessibility text; failure/retry |
| Existing `npm run check` | 614 tests passed across its suites; TypeScript passed |
| Generated settings | Swift 6, complete concurrency checking, approachable concurrency, main-actor UI default, iOS 26.0 |
| Native product inspection | Debug and Release passed; no detected excluded runtimes, JS assets or unexpected service entitlements |
| Product guard negative controls | Rejected a JS-contaminated app copy and an ad-hoc-signed copy with an unexpected app-group entitlement |
| Privacy and diff checks | Generated products and local identity remain ignored; unrelated work stays outside the commit |

The TDD cycles observed actual failures before implementing decoding, schema and
content validation, fixture loading, initial activation, repeat-load protection,
stale-result protection, cancellation propagation and UI retry injection.
Additional isolation and corruption tests passed against the already-scoped
implementation; these are not claimed as separate failing-first cycles.

## Behavior and boundaries

The app shows a synthetic library and sentence detail with system navigation and
semantic text styles. It does not expose fake learning, playback or purchase
actions. Its actor owns only `SwiftNativeFoundation/v1` under its injected root.
Existing corrupt bytes survive a failed load. The bootstrap cancels owned work
and prevents an old completion from replacing a newer state.

The Debug-only failure switch exercises retry without altering data. Release
does not contain that injection. Sample content and tests contain no private
lessons, account identifiers or signing information.

## Diagnostics and limits

- Xcode emits an App Intents metadata-extraction notice because this shell does
  not link AppIntents; no App Intents feature is in W2 scope.
- During iOS 27 accessibility inspection, runtime logs included Apple's duplicate
  `UIAccessibilityLoaderWebShared` registration and an `NSMapGet` diagnostic.
  UI tests and manual inspection completed. The underlying system diagnostic is
  not diagnosed or claimed fixed by this change.
- No physical-device install, account access, cloud call, purchase, new service
  registration, push, PR or release was performed for W2.
- The reference CI configuration and protections were not changed. The owner's
  iOS 27 request applies to this local Swift verification, not the reference CI pin.
- W3–W8 remain responsible for the real learning domain, media, complete UI,
  launch animation/haptics, Apple services, delivery and release acceptance.

Exact reproduction commands are in [the native guide](../../native-ios/README.md).
Raw build logs, result bundles and screenshots stay in ignored local output;
machine paths, simulator IDs and account metadata are not published here.
