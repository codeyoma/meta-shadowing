#!/bin/bash
set -euo pipefail

# Exercise the public product guard with a real build, not mocked tool output.
source_app=${1:?Usage: bash test-native-runtime-inspection.sh PATH_TO_RELEASE_APP}
native_root=$(cd "$(dirname "$0")/.." && pwd)
test_root=$(mktemp -d /tmp/metashadowing-runtime-guard.XXXXXX)
trap 'case "$test_root" in /tmp/metashadowing-runtime-guard.*) rm -rf -- "$test_root" ;; esac' EXIT
mkdir -p "$test_root/export-inspection"
test_app="$test_root/export-inspection/GuardFixture.app"
ditto "$source_app" "$test_app"

# An export directory's name is not a linked Expo dependency.
bash "$native_root/scripts/verify-native-product.sh" "$test_app" Release

# A real Mach-O dependency remains forbidden, regardless of the binary's name.
xcrun --sdk macosx clang -dynamiclib \
    "$native_root/scripts/fixtures/runtime-inspection/dependency.c" \
    -install_name '@rpath/hermes.framework/hermes' -o "$test_root/dependency.dylib"
xcrun --sdk macosx clang \
    "$native_root/scripts/fixtures/runtime-inspection/consumer.c" \
    "$test_root/dependency.dylib" -o "$test_app/RuntimeDependencyFixture"
if bash "$native_root/scripts/verify-native-product.sh" "$test_app" Release > "$test_root/rejection.log" 2>&1; then
    echo 'FAIL: forbidden linked runtime was accepted' >&2
    exit 1
fi
grep -Fxq 'Forbidden native runtime dependency or symbol' "$test_root/rejection.log"
echo 'PASS: export paths are accepted; forbidden linked runtimes remain rejected.'
