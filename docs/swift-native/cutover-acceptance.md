# Native cutover acceptance — #99

Status: **local implementation and verification complete; not ready for controlled replacement**. Physical-device and live-service gates below remain pending. No #99 physical installation, account access, reset, purchase or release has occurred.

Candidate native source tree: `8d638f0cd7b39ceb5f084912bcc0d8827ddd79ec`.
This is the Git tree for `native-ios/`, not a release version or signed-device build.
The icon-enabled products are separately built, inspected, and launch-checked.
Final complete native coverage uses the native guide's complementary CI selections:
`-only-testing:NativeFoundationUITests/PlayerUITests` and
`-skip-testing:NativeFoundationUITests/PlayerUITests`, each serial on an isolated
simulator after StoreKit setup. Neither selection alone is full-suite evidence.
Reproduction commands are in the
[native build guide](../../native-ios/README.md#generate-test-and-build); use the
fictional CI configuration, a dedicated iOS 27 simulator, and the separate StoreKit
setup scheme before the complete main test scheme.

## Baseline, not current acceptance

On 2026-09-29, PR #107 merged into `dev` at `1096342`; its required hosted checks passed. The same tracked tree is present at `5cc59aa`. A fresh package baseline for #99 passed all 337 tests: LearningDomain 53, LearningPersistence 39, LearningReference 18, LearningMedia 49, AppleServices 109, AppFoundation 69.

Previous local iOS 27 evidence passed 96 behavioral tests and one StoreKit setup check. #99 must rerun the final candidate; those earlier counts do not close the new parity audit.

## Local gates

- [x] Resolve or explicitly disposition G1–G5 in the [48-feature matrix](cutover-matrix.md).
- [x] Focused repeated runtime/reference/service teardown tests preserve durable progress and reject obsolete work.
- [x] Focused normal installed-learning journey survives unavailable services and relaunch without new credit.
- [x] Long price, largest text, light/dark, Reduce Motion, touch targets and hidden-text boundaries checked locally.
- [x] Final six-package suite and complete iOS 27 coverage pass with zero failed/skipped tests across the two complementary CI selections.
- [x] Debug/Release built products pass the no-JavaScript/runtime, content, entitlement and test-bypass guards.
- [x] Independent Standards and Spec reviews complete; actionable findings resolved.

## Focused local evidence — 2026-09-29

- Runtime/reference/service tests cover three consecutive reentries, an obsolete dictionary response, and stale destructive confirmations. The strengthened runtime case starts with a nonzero confirmed checkpoint and compares its source progress, selected unit, run identity and XP after each teardown.
- The checkpoint case exposed a real preparation-boundary bug: pausing a retired driver could copy its prior cycle position into the next cycle. Position capture now requires the matching prepared transport token. The deterministic coordinator regression failed before the fix; all 16 coordinator cases and all 8 native lifecycle cases then passed.
- Paid-card metadata, a long local StoreKit price (`$99,999,999.99`) at the largest text size, accountless relaunch, reward expiry/relaunch, and isolated diagnostic controls passed focused UI checks. No purchase was performed by the price journey.
- Reward review exposed incorrect attribution of imported XP. Real SQLite tests imported 3 XP before a 1-XP command, reproduced an incorrect 4-XP receipt, and now require exactly 1 XP for both direct success and lost-reply recovery. Seven committed-feedback tests passed.
- A nine-case UI selection passed with simulator Reduce Motion enabled. A follow-up normal local/cloud/download confirmation journey passed in light and dark appearance at the largest Dynamic Type size. Native alert messages scroll at this size, and actions remain reachable. Cloud confirmation uses a UUID-scoped controlled external transport, never a real account. The test initially overscrolled a row behind the fixed header; bounded viewport scrolling corrected the test without changing production alerts. Original Reduce Motion and related animation preferences were restored and verified afterward.
- The final package run passed all 341 tests: LearningDomain 53, LearningPersistence 39, LearningReference 18, LearningMedia 50, AppleServices 109, AppFoundation 72. Dedicated iOS 27 simulators passed the separate StoreKit setup check. Final native results cover all 104 cases: the player selection passed 19, and the remaining selection passed 85 (29 UI, 37 media/reference, 19 StoreKit). Each finalized result reports zero failed and zero skipped tests. These are local results, not a hosted CI result.
- The first full native run completed 104 cases: 103 passed, one failed, none skipped. The restore test failed in fixture setup, waiting for cached entitlement propagation before the app's restore action could execute. A diagnostic run passed, showing the propagation failure was intermittent. The corrected test verifies the fixture's exact purchased transaction before executing real `AppStore.sync()`, retaining all restored-ownership and network-failure assertions. Its full 19-case StoreKit target passed; no retry was added to the app or test. The original failed run remains recorded, not reclassified as successful.
- A concurrent local UI-selection attempt hit a Settings-tab hittability failure and was interrupted. A focused diagnostic run passed; the precise transient cause remains unproven. Failure-only screenshots and hierarchy attachments were added without increasing the deadline, retrying the action, or changing the assertion. The player selection then finalized with 19 passes and no failures/skips. The remaining selection ran afterward without concurrent UI automation and passed all 85 cases; the earlier failed/interrupted result remains excluded from acceptance.
- The clean-copy Debug/Release configuration check, service mapper self-test, fictional downloader build, local-video boundary self-test, actionlint and diff checks passed without private identity files. Both Debug and Release compiled and passed the complete built-product guard: iOS 26.0 minimum, compiled primary icon, unchanged sample/launch assets, no excluded runtimes, exact configured entitlements, and no Release test bypasses.
- The owner approved resizing the original opaque 1254×1254 icon with macOS tools. A separate 1024×1024 AppIcon preserves the artwork and has no alpha channel; the source image remains unchanged. This resolves the earlier `Missing compiled primary app icon` failure. The icon-enabled Debug product was installed and launched on the dedicated simulator.
- Independent Standards and Spec reviews found five actionable issues in the initial candidate; all were fixed and regression-tested. Both axes reported zero remaining actionable findings in the updated candidate and its UI/icon addenda. This is a code review, not device or live-service acceptance.

## Hardware gate — #103

The owner previously verified launch/loading haptics on the W4 build. Remaining checks are learning/Repeat haptics, wired input/output and gain, permission handling, eligible headset actions, unplugging/unsupported routes, real interruptions, lock/background behavior, and lesson-exit/completion cleanup. Test the finished normal player and record the exact candidate revision locally.

Manual VoiceOver is excluded by owner decision, not reported as passed. Simulator observations do not prove tactile timing, real calls, physical microphone routing or headset dispatch.

## Live Apple-service gate — carried from #98

- [ ] Designated signed-device sandbox purchase, restore, pending, cancellation and declined approval.
- [ ] Real Apple-hosted acquisition, interruption/cancellation/retry, installation and offline use.
- [ ] Private CloudKit Development account switching, permission/quota failures and offline recovery.
- [ ] Two-device merge/deduplication and recovery without overwriting history from an empty local store.
- [ ] Separately authorized disposable-data local/cloud reset and stale-client resurrection checks.

No login or live service is needed for local StoreKit fixtures. These live journeys require separately designated accounts/configuration and operation scope. Missing prerequisites remain blockers, never fixture passes.

## Replacement gate

- [ ] Identify the exact designated installation and candidate build privately.
- [ ] Preserve recoverable reference source and binary with local checksums.
- [ ] Obtain immediate owner approval of the installation and reset scope; default is no uninstall or deletion.
- [ ] Install only the approved candidate and verify representative normal offline/recovery journeys.

Retaining an old binary does not promise recovery of new Swift progress or downgrade-data compatibility. No TestFlight upload, public release, production schema change, identity registration or reference-source deletion is authorized by this report.
