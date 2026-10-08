#!/bin/bash
set -euo pipefail
umask 077

# Validate only the archived source and fictional CI configuration. Preserve the
# caller's selected Xcode, but remove inputs that redirect builds or Git context.
unset NATIVE_LOCAL_VIDEO_SOURCE XCODE_XCCONFIG_FILE SDKROOT TOOLCHAINS
for native_git_variable in "${!GIT_@}"; do
  unset "$native_git_variable"
done

fail() {
  echo "FAIL: $1; private diagnostics remain in the supplied output directory." >&2
  exit "${2:-1}"
}

requested_simulator=''
output_dir=''
test "$#" -eq 4 || fail 'Use --simulator-id ID --output-dir ABS_EXISTING_DIR'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --simulator-id) requested_simulator=${2:-}; shift 2 ;;
    --output-dir) output_dir=${2:-}; shift 2 ;;
    *) fail 'Use --simulator-id ID --output-dir ABS_EXISTING_DIR' ;;
  esac
done
test -n "$requested_simulator" || fail 'An explicit simulator is required'
case "$output_dir" in /*) ;; *) fail 'An absolute output directory is required' ;; esac
test -d "$output_dir" || fail 'The output directory must already exist'
snapshot_root=$(cd "$(dirname "$0")/../.." && pwd -P)
test "$(pwd -P)" = "$snapshot_root" || fail 'Run from the archived snapshot root'
if [ -e .git ] || [ -L .git ]; then
  fail 'Full verification requires an isolated archive snapshot'
fi
if [ -e native-ios/Config/Local.xcconfig ] || [ -L native-ios/Config/Local.xcconfig ]; then
  fail 'Private local configuration must not enter the snapshot'
fi
test -f native-ios/project-ci.yml || fail 'The fictional CI specification is required'
for tool in xcodebuild xcodegen xcrun jq ruby; do
  command -v "$tool" >/dev/null || fail "Required tool unavailable: $tool"
done
run_dir=$(mktemp -d "$output_dir/native-full.XXXXXX" 2>/dev/null) || fail 'Cannot create private test outputs'
xcodebuild -version > "$run_dir/toolchain.log" 2>&1 || fail 'Xcode version inspection failed'
if ! ruby -e 'exit(File.read(ARGV.fetch(0)).match?(/^Xcode 27(?:\.|$)/) ? 0 : 1)' "$run_dir/toolchain.log"; then
  fail 'Select Xcode 27 before full verification'
fi
xcrun simctl list devices available --json > "$run_dir/devices.json" 2> "$run_dir/devices.log" || fail 'Simulator inventory failed'
state=$(jq -er --arg id "$requested_simulator" '
  [.devices["com.apple.CoreSimulator.SimRuntime.iOS-27-0"][]? |
    select(.udid == $id and .isAvailable == true and
      (.name | type) == "string" and (.name | startswith("MetaShadowing Native Pre-push")) and
      (.state == "Booted" or .state == "Shutdown"))] |
  if length == 1 then .[0].state else error("Unresolved authorized simulator") end
' "$run_dir/devices.json" 2> "$run_dir/selection.log") || fail 'The explicit simulator could not be resolved'

echo 'Native full: generating project.'
xcodegen generate --spec native-ios/project-ci.yml --quiet > "$run_dir/generation.log" 2>&1 || fail 'Fictional CI project generation failed'
products="$run_dir/NativeTests.xctestproducts"
echo 'Native full: building test products.'
xcodebuild build-for-testing -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Debug \
  -destination 'generic/platform=iOS Simulator' ARCHS=arm64 \
  -derivedDataPath "$run_dir/build" -testProductsPath "$products" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- > "$run_dir/build.log" 2>&1 || fail 'Native build-for-testing failed'
echo 'Native full: preparing simulator.'
if [ "$state" = Shutdown ]; then
  xcrun simctl boot "$requested_simulator" > "$run_dir/boot.log" 2>&1 || fail 'Dedicated simulator boot failed'
fi
xcrun simctl bootstatus "$requested_simulator" -b > "$run_dir/bootstatus.log" 2>&1 || fail 'Dedicated simulator readiness failed'
destination="platform=iOS Simulator,id=$requested_simulator,arch=arm64"
echo 'Native full: enumerating tests.'
xcodebuild test-without-building -testProductsPath "$products" \
  -destination "$destination" -parallel-testing-enabled NO \
  -enumerate-tests -test-enumeration-style flat -test-enumeration-format json \
  -test-enumeration-output-path "$run_dir/inventory.json" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- > "$run_dir/enumeration.log" 2>&1 || fail 'Full native enumeration failed'
if ! jq -e '
  type == "object" and (.errors | type) == "array" and .errors == [] and
  (.values | type) == "array" and (.values | length) > 0 and
  all(.values[]; type == "object" and
    (.disabledTests | type) == "array" and .disabledTests == [] and
    (.enabledTests | type) == "array" and
    all(.enabledTests[]; type == "object" and (.identifier | type) == "string" and
      (.identifier | test("^[^/]+/[^/]+/[^/]+\\([^/]*\\)$")))) and
  ([.values[].enabledTests[].identifier] as $ids |
    ($ids | length) > 0 and
    any($ids[]; startswith("NativeFoundationUITests/")) and
    any($ids[]; startswith("NativeMediaIntegrationTests/")) and
    ([$ids[] | split("/")[1:] | join("/")] as $names |
      ($names | length) == ($names | unique | length)))
' "$run_dir/inventory.json" > "$run_dir/enumeration-validation.log" 2>&1; then
  fail 'Full native inventory is empty, incomplete, disabled or invalid'
fi
printf '[]\n' > "$run_dir/selection.json"
echo 'Native full: running all native tests.'
native_status=0
xcodebuild test-without-building -testProductsPath "$products" \
  -destination "$destination" -parallel-testing-enabled NO \
  -collect-test-diagnostics never -resultBundlePath "$run_dir/native.xcresult" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- > "$run_dir/native.log" 2>&1 || native_status=$?
test -f "$run_dir/native.xcresult/Info.plist" || fail 'No finalized native result bundle'
echo 'Native full: validating results.'
xcrun xcresulttool get test-results summary --path "$run_dir/native.xcresult" \
  > "$run_dir/summary.json" 2> "$run_dir/summary.log" || fail 'Native summary export failed'
xcrun xcresulttool get test-results tests --path "$run_dir/native.xcresult" \
  > "$run_dir/tests.json" 2> "$run_dir/report.log" || fail 'Native case export failed'
test "$native_status" -eq 0 || fail 'Full native test execution failed' "$native_status"
ruby native-ios/scripts/validate-native-test-results.rb \
  "$run_dir/inventory.json" "$run_dir/selection.json" "$run_dir/summary.json" "$run_dir/tests.json"
