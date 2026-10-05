#!/bin/bash
set -euo pipefail

# Controlled external-service failure with real local storage/media/reference code.
# Never change host/phone radios, private configuration, accounts or installed phone apps.
native_root=$(cd "$(dirname "$0")/.." && pwd)
requested_simulator=''
if [ "$#" -gt 0 ]; then
  if [ "$#" -ne 2 ] || [ "$1" != --simulator-id ]; then
    echo 'Usage: bash test-offline-acceptance.sh [--simulator-id BOOTED_NATIVE_IOS_27_ID]' >&2
    exit 2
  fi
  requested_simulator=$2
fi
for tool in swift xcrun xcodebuild xcodegen jq rg; do
  command -v "$tool" > /dev/null || { echo "Required tool unavailable: $tool" >&2; exit 2; }
done
inventory=$(xcrun simctl list devices available --json)
simulator=$(jq -er --arg id "$requested_simulator" '
  [.devices["com.apple.CoreSimulator.SimRuntime.iOS-27-0"][]? |
    select(.isAvailable and .state == "Booted" and (.name | startswith("MetaShadowing Native ")) and
      ($id == "" or .udid == $id))] |
  if length == 1 then .[0].udid else error("Choose exactly one booted dedicated iOS 27 simulator") end
' <<< "$inventory" 2>/dev/null) || {
  echo 'Exactly one booted, dedicated MetaShadowing Native iOS 27 simulator is required; no fallback or physical install.' >&2
  exit 2
}
acceptance_root=$(mktemp -d /tmp/metashadowing-offline-acceptance.XXXXXX)
printf 'Artifacts: %s\n' "$acceptance_root"
cd "$native_root/.."
for package in LearningDomain LearningPersistence AppFoundation LearningMedia LearningReference AppleServices; do
  if swift test --package-path "native-ios/Packages/$package" > "$acceptance_root/$package.log" 2>&1; then
    if ! rg -q 'Test run with [1-9][0-9]* tests?( in [1-9][0-9]* suites?)? passed' "$acceptance_root/$package.log" ||
        rg -q '(Test|Suite) .+ skipped(:|[[:space:]]|$)' "$acceptance_root/$package.log"; then
      echo "FAIL: $package returned no complete, unskipped Swift Testing result." >&2
      exit 1
    fi
    printf 'PASS: %s\n' "$package"
  else
    package_status=$?
    echo "FAIL: $package; private diagnostics retained in the artifact directory." >&2
    exit "$package_status"
  fi
done
xcodegen generate --spec native-ios/project-ci.yml --quiet > "$acceptance_root/generation.log" 2>&1
if xcodebuild test -project native-ios/MetaShadowingNative.xcodeproj \
    -scheme MetaShadowingNative -configuration Debug \
    -destination "platform=iOS Simulator,id=$simulator,arch=arm64" \
    -derivedDataPath "$acceptance_root/build" -parallel-testing-enabled NO \
    -only-testing:NativeFoundationUITests/OfflineAcceptanceUITests \
    -only-testing:NativeFoundationUITests/ReferenceToolsUITests \
    -only-testing:NativeMediaIntegrationTests -collect-test-diagnostics never \
    -resultBundlePath "$acceptance_root/native.xcresult" \
    CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- > "$acceptance_root/native.log" 2>&1; then
  native_status=0
else
  native_status=$?
fi
if [ ! -f "$acceptance_root/native.xcresult/Info.plist" ]; then
  echo 'FAIL: no finalized native test result.' >&2
  exit 1
fi
xcrun xcresulttool get test-results summary --path "$acceptance_root/native.xcresult" |
  jq '{result, totalTestCount, passedTests, failedTests, skippedTests}' > "$acceptance_root/summary.json"
jq . "$acceptance_root/summary.json"
if [ "$native_status" -ne 0 ]; then
  echo 'FAIL: native execution returned a failure; diagnostics retained.' >&2
  exit "$native_status"
fi
jq -e '.result == "Passed" and (.totalTestCount | type) == "number" and
  .totalTestCount > 0 and .passedTests == .totalTestCount and .failedTests == 0 and .skippedTests == 0' \
  "$acceptance_root/summary.json" > /dev/null
xcrun xcresulttool get test-results tests --path "$acceptance_root/native.xcresult" > "$acceptance_root/tests.json"
# Xcode may return success when a selected class no longer exists. Require actual
# finalized cases from each selected group, including the real native gain graph.
jq -e '
  [.testNodes[] | .. | objects | select(.nodeType? == "Test Case")] as $cases |
  all($cases[]; .result == "Passed") and
  any($cases[]; .nodeIdentifier == "OfflineAcceptanceUITests/testOfflineDownloadFailsWithoutBlockingBundledLearning()") and
  any($cases[]; .nodeIdentifier == "OfflineAcceptanceUITests/testDownloadedLessonSurvivesOfflineRelaunchWithoutNewCredit()") and
  any($cases[]; .nodeIdentifier | startswith("ReferenceToolsUITests/")) and
  any($cases[]; .nodeIdentifier == "VoiceMonitorGainTests/extendedGainDoublesMicrophoneAmplitudeWithoutBoostingMedia()") and
  any(.testNodes[] | .. | objects; .nodeType? == "Unit test bundle" and .name == "NativeMediaIntegrationTests")
' "$acceptance_root/tests.json" > /dev/null
echo 'PASS: controlled offline acceptance. This is not a physical radio-off or microphone listening test.'
