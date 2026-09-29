#!/bin/bash
set -euo pipefail
native_root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/native-service-build.XXXXXX")
trap 'rm -rf -- "$fixture"' EXIT
swift "$native_root/scripts/configure-apple-services.swift" --fixture-output "$fixture/config"
mkdir -p "$fixture/project"
xcodegen generate --spec "$fixture/config/project.json" --project "$fixture/project" --quiet
project="$fixture/project/MetaShadowingNative.xcodeproj"
rg -q 'com.apple.product-type.extensionkit-extension' "$project/project.pbxproj"
rg -q 'EXTENSIONS_FOLDER_PATH' "$project/project.pbxproj"
# Build only the fictional downloader; no app launch, Apple account, or network test.
xcodebuild build -jobs 2 -project "$project" -scheme SampleDownloader -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$fixture/build" CODE_SIGNING_ALLOWED=NO -quiet
test -d "$fixture/build/Build/Products/Debug-iphonesimulator/SampleDownloader.appex"
echo 'PASS: configured ExtensionKit downloader builds without signing or account access.'
