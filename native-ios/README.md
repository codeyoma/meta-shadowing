# Standalone Swift iOS foundation

This includes the #93 development shell and #94 learning/storage foundation, not
a feature-complete replacement app. The normal UI displays one synthetic lesson
and three sentence pairs. A Debug probe exercises real SQLite confirmation and
relaunch. It does not play media, purchase content or contact cloud services.
The Expo app remains the behavioral reference until the later migration tickets land.

## Ownership and isolation

- `LearningDomain`: Sendable values, sixteen-stage rules, reward receipts and backup validation.
- `LearningPersistence`: profile-isolated, actor-owned transactional system SQLite.
- `AppFoundation`: local workspaces, committed-state controller and observable bootstrap.
- `App`: the composition root, native navigation and scene lifecycle integration.
- `Tests/AppUITests`: launch, navigation, foreground, relaunch, Dynamic Type and retry.

Only the app root constructs the workspace, under Application Support's
`SwiftNativeFoundation/v1/library.json`. No reference directories are scanned.
Missing content seeds a public-safe fixture; corrupt or inaccessible content fails
without resetting it. The learning store uses a separate injected namespace;
see [the W3 consumer contract](../docs/swift-native/learning-storage-contract.md).

The bootstrap owns one cancellable load task. Inactivity cancels pending work,
while generation checks reject late results from non-cooperative loaders. A ready
library remains available across foreground transitions without loading again.
Views receive narrow values; filesystem work stays off the main actor.

## Local prerequisites and identity

The local verification toolchain is Xcode 27, Swift 6 language mode and XcodeGen
2.46.0. Use an **iOS 27 Simulator** for this work, as requested by the owner. The
app's deployment minimum remains **iOS 26.0**. The product check also uses `rg` and
`jq`. No npm install, Expo generation, CocoaPods or Metro is needed for this target.

1. Copy `native-ios/Config/Example.xcconfig` to `native-ios/Config/Local.xcconfig`.
2. Set `NATIVE_APP_BUNDLE_IDENTIFIER` to the existing app identifier from your
   local configuration. In this checkout it can be read with
   `plutil -extract expo.ios.bundleIdentifier raw app.json`.
3. Keep `Local.xcconfig` ignored. Do not add an Apple account, signing team or
   new production identifier for simulator verification.

The shell deliberately uses the existing identity. Installing it on a reference
device would replace that app. **Use a newly created dedicated simulator, never
the reference simulator or the physical phone.** Do not infer install authority
from the presence of a connected device.

## Generate, test and build

Run from the worktree root. Create the simulator once and retain its returned ID
locally; IDs must not be committed or posted in issues.

```sh
xcodegen generate --spec native-ios/project.yml
swift test --package-path native-ios/Packages/LearningDomain
swift test --package-path native-ios/Packages/LearningPersistence
swift test --package-path native-ios/Packages/AppFoundation

NATIVE_SIM_ID="$(xcrun simctl create 'MetaShadowing Native W2 iOS 27' \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17 \
  com.apple.CoreSimulator.SimRuntime.iOS-27-0)"

xcodebuild -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Debug \
  -destination "platform=iOS Simulator,id=$NATIVE_SIM_ID" \
  -derivedDataPath native-ios/DerivedData CODE_SIGNING_ALLOWED=NO build

xcodebuild -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Debug \
  -destination "platform=iOS Simulator,id=$NATIVE_SIM_ID" \
  -derivedDataPath native-ios/DerivedData -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test

xcodebuild -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Release \
  -destination "platform=iOS Simulator,id=$NATIVE_SIM_ID" \
  -derivedDataPath native-ios/DerivedData CODE_SIGNING_ALLOWED=NO build

bash native-ios/scripts/verify-native-product.sh \
  native-ios/DerivedData/Build/Products/Release-iphonesimulator/MetaShadowingNative.app
```

XcodeBuildMCP can run the same scheme with the dedicated simulator selected.
The Debug-only `--ui-test-fail-first-load` argument injects one synthetic load
failure for retry testing. It does not edit storage and is absent from Release.
`--ui-test-learning-storage` opens the synthetic W3 storage probe in Debug only.
The large-text UI test uses the largest accessibility text category.

The product check inspects resources, all embedded Mach-O dependencies/symbols,
the deployment minimum and signed entitlements. This is a local W2 guard, not an
App Store security review or evidence of later service functionality.

## Hosted Swift CI

GitHub Actions now validates only the standalone Swift app. It uses the
GitHub-hosted `xcode-27` public-preview runner, explicitly selects Xcode 27.0,
and runs UI tests on iOS 27.0. The deployment minimum remains iOS 26.0.

`project-ci.yml` includes the local app specification and replaces only its
configuration files with `Config/CI.xcconfig`. This uses a fictional,
unsigned simulator identity and never reads or overwrites `Local.xcconfig`.
No Apple account, provisioning profile, npm dependency or Expo generation is needed.

```sh
bash native-ios/scripts/test-ci-configuration.sh
xcodegen generate --spec native-ios/project-ci.yml
```

The configuration test generates a disposable copy without local configuration
and checks the resolved Debug/Release identity, signing and compiler settings.
Generating the CI project replaces only the ignored generated Xcode project;
run `xcodegen generate --spec native-ios/project.yml` to return to local settings.
Package tests, Debug UI tests, Debug/Release builds and product checks use the
same commands above. CI supplies disposable build/result paths. See
[the CI guide](../docs/native-ci.md) for the required jobs and coverage limits.

## Reference checks and remaining work

`npm run check` remains available manually for the untouched Expo reference, but
is not run by hosted CI. Required check names and branch protections are unchanged;
their app-check implementations now validate Swift. Local success does not claim
a hosted CI result.

W4–W8 still own media, finished UI/launch animation and haptics,
Apple services, delivery, and replacement/release acceptance. No performance
benchmarks or improvement targets are required. Physical-device replacement,
account access and public distribution require separate authorization.
