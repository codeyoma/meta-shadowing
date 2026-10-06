#!/bin/bash
# Merge strings extracted by the latest Debug build into the app's String Catalog.
# Xcode syncs the catalog automatically in the IDE; command-line builds do not.
# Usage: bash native-ios/scripts/sync-string-catalog.sh [derived-data-path]
set -euo pipefail

native_root=$(cd "$(dirname "$0")/.." && pwd)
derived_data=${1:-"$native_root/DerivedData"}
intermediates="$derived_data/Build/Intermediates.noindex/MetaShadowingNative.build/Debug-iphonesimulator/MetaShadowingNative.build"
test -d "$intermediates" || { echo "Build the Debug app first: missing $intermediates" >&2; exit 1; }

stringsdata=()
while IFS= read -r file; do stringsdata+=(--stringsdata "$file"); done \
    < <(find "$intermediates" -name '*.stringsdata' | sort)
test ${#stringsdata[@]} -gt 0 || { echo 'No extracted strings found.' >&2; exit 1; }

xcrun xcstringstool sync "$native_root/App/Localizable.xcstrings" "${stringsdata[@]}"
echo "Synced $(( ${#stringsdata[@]} / 2 )) string tables into App/Localizable.xcstrings."
