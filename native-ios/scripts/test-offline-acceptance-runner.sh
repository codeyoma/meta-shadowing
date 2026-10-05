#!/bin/bash
set -euo pipefail
native_root=$(cd "$(dirname "$0")/.." && pwd)
fixture_root=$(mktemp -d /tmp/metashadowing-offline-runner-test.XXXXXX)
trap 'case "$fixture_root" in /tmp/metashadowing-offline-runner-test.*) rm -rf -- "$fixture_root" ;; esac' EXIT
mkdir -p "$fixture_root/bin"
for tool in swift xcrun xcodegen xcodebuild; do
  ln -s "$native_root/scripts/fixtures/offline-acceptance/tool.sh" "$fixture_root/bin/$tool"
done
export FIXTURE_OPERATIONS="$fixture_root/operations.log"
export PATH="$fixture_root/bin:$PATH"
export FIXTURE_CASE=passed
if ! bash "$native_root/scripts/test-offline-acceptance.sh" > "$fixture_root/output.log" 2>&1; then
  echo 'FAIL: a complete passing acceptance run must succeed.' >&2
  exit 1
fi
test "$(rg -c '^swift test --package-path ' "$FIXTURE_OPERATIONS")" = 6
rg -q -- '-only-testing:NativeFoundationUITests/OfflineAcceptanceUITests' "$FIXTURE_OPERATIONS"
rg -q -- '-only-testing:NativeFoundationUITests/ReferenceToolsUITests' "$FIXTURE_OPERATIONS"
rg -q -- '-only-testing:NativeMediaIntegrationTests' "$FIXTURE_OPERATIONS"
rg -q -- '-parallel-testing-enabled NO' "$FIXTURE_OPERATIONS"
if rg -q -- 'platform=iOS,id=|allowProvisioningUpdates|Local.xcconfig|skip-testing' "$FIXTURE_OPERATIONS"; then
  echo 'FAIL: offline acceptance must not install on a phone or weaken its test selection.' >&2
  exit 1
fi
for FIXTURE_CASE in package-failure empty-package package-skipped build-failure failed-result skipped-result empty-result missing-result missing-class old-runtime; do
  export FIXTURE_CASE
  if bash "$native_root/scripts/test-offline-acceptance.sh" > "$fixture_root/$FIXTURE_CASE.log" 2>&1; then
    echo "FAIL: $FIXTURE_CASE must fail acceptance." >&2
    exit 1
  fi
done
export FIXTURE_CASE=passed
if bash "$native_root/scripts/test-offline-acceptance.sh" --simulator-id invalid > "$fixture_root/invalid-id.log" 2>&1; then
  echo 'FAIL: an unresolved simulator must not fall back to another destination.' >&2
  exit 1
fi
echo 'PASS: acceptance runner rejects failures, skips, empty results and non-iOS-27 destinations.'
