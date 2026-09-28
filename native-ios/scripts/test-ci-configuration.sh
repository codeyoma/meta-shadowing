#!/bin/bash
set -euo pipefail

# Exercise generation and resolved settings in a copy with no private config.
# A CI spec that accidentally depends on Local.xcconfig must fail this test.
native_root=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/native-ci-config.XXXXXX")
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/native-ios" "$fixture/assets/brand" "$fixture/assets/illustrations"
rsync -a --exclude Local.xcconfig --exclude '*.xcodeproj' --exclude DerivedData \
    --exclude .build --exclude .swiftpm "$native_root/" "$fixture/native-ios/"
for resource in talking-pup-512.webp talking-pup-still.png launch-wordmark.png; do
    cp "$native_root/../assets/brand/$resource" "$fixture/assets/brand/$resource"
done
cp "$native_root/../assets/illustrations/morning-notes.png" "$fixture/assets/illustrations/morning-notes.png"
cp -R "$native_root/../assets/sample" "$fixture/assets/sample"
test ! -e "$fixture/native-ios/Config/Local.xcconfig"

if ! xcodegen generate --spec "$fixture/native-ios/project-ci.yml" --quiet; then
    echo 'FAIL: CI project must generate without a local identity or signing config.' >&2
    exit 1
fi

for configuration in Debug Release; do
    xcodebuild -project "$fixture/native-ios/MetaShadowingNative.xcodeproj" \
        -scheme MetaShadowingNative -configuration "$configuration" \
        -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
        -showBuildSettings -json \
        > "$fixture/settings.json"
    jq -e '
        [.[] | select(.target == "MetaShadowingNative") | .buildSettings] |
        length == 1 and all(.[];
            .PRODUCT_BUNDLE_IDENTIFIER == "com.example.metashadowing.ci" and
            .IPHONEOS_DEPLOYMENT_TARGET == "26.0" and
            .SWIFT_VERSION == "6.0" and
            .SWIFT_STRICT_CONCURRENCY == "complete" and
            .CODE_SIGNING_ALLOWED == "NO" and
            ((.DEVELOPMENT_TEAM // "") == ""))
    ' "$fixture/settings.json" >/dev/null
done

echo 'PASS: Debug and Release CI generation need no local identity or signing config.'
