#!/bin/bash
set -euo pipefail
shopt -s nocasematch

for tool in rg jq file otool nm codesign plutil strings cmp; do
    command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
app=${1:?Usage: bash native-ios/scripts/verify-native-product.sh PATH_TO_APP}
configuration=${2:-}
if [[ -z "$configuration" && "$app" == */Release-iphonesimulator/* ]]; then configuration=Release; fi
native_root=$(cd "$(dirname "$0")/.." && pwd)
plist="$app/Info.plist"
test -f "$plist" || { echo 'Missing app Info.plist' >&2; exit 1; }
executable=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$plist")
test -f "$app/$executable" || { echo 'Missing app executable' >&2; exit 1; }
minimum=$(/usr/libexec/PlistBuddy -c 'Print MinimumOSVersion' "$plist")
test "$minimum" = '26.0' || { echo 'Unexpected deployment minimum' >&2; exit 1; }
plutil -extract UIDeviceFamily json -o - "$plist" | jq -e '. == [1]' >/dev/null || {
    echo 'Expected iPhone-only device family' >&2; exit 1;
}
icon_name=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconName' "$plist" 2>/dev/null || true)
test "$icon_name" = AppIcon && test -f "$app/Assets.car" || {
    echo 'Missing compiled primary app icon' >&2; exit 1;
}
if [[ "$configuration" == Release && -e "$app/LocalVideo" ]]; then
    echo 'Internal video resource leaked into Release' >&2; exit 1
fi
for resource in talking-pup-512.webp talking-pup-still.png launch-wordmark.png; do
    cmp -s "$app/$resource" "$native_root/../assets/brand/$resource" || {
        echo 'Missing or changed bundled launch artwork' >&2; exit 1;
    }
done
cmp -s "$app/sample/manifest.json" "$native_root/../assets/sample/manifest.json" || {
    echo 'Missing or changed bundled sample manifest' >&2; exit 1;
}
for resource in "$native_root"/../assets/sample/audio/*.m4a; do
    cmp -s "$app/sample/audio/${resource##*/}" "$resource" || {
        echo 'Missing or changed bundled sample audio' >&2; exit 1;
    }
done
/usr/libexec/PlistBuddy -c 'Print NSMicrophoneUsageDescription' "$plist" >/dev/null
test "$(/usr/libexec/PlistBuddy -c 'Print UIBackgroundModes:0' "$plist")" = audio

# Inspect embedded resources and every Mach-O, including Debug's code dylib.
native_binaries=0
while IFS= read -r -d '' artifact; do
    if [[ "$artifact" =~ \.(js|jsbundle|hbc)$ ]] ||
        printf '%s\n' "$artifact" | grep -Eiq '/(lib)?(Expo|React|hermes|JavaScriptCore|jsc)[^/]*\.(framework|bundle|dylib)(/|$)'; then
        echo 'Forbidden JavaScript/runtime artifact' >&2
        exit 1
    fi
    if file -b "$artifact" | grep -q 'Mach-O'; then
        native_binaries=$((native_binaries + 1))
        # otool's unindented binary header is a path, not a linked dependency.
        dependencies=$(otool -L "$artifact" | sed -n '/^[[:space:]]/p')
        symbols=$(nm -u "$artifact")
        if [[ "$configuration" == Release ]] && strings "$artifact" | rg 'SyntheticMediaProbe|SyntheticMediaFixtures|ui-test-|media-probe-video|SyntheticLearningProbe|ProductTestCatalog|ProductTestStore|ServiceTestAssets|ServiceTestCloud|DeveloperToolsView|DeveloperDownload|DeveloperAnalysis|DevelopmentLibraryCatalog|DevelopmentDuoAssets|development-library' >/dev/null; then
            echo 'Debug probe code leaked into Release' >&2; exit 1
        fi
        if printf '%s\n%s\n' "$dependencies" "$symbols" |
            grep -Eiq '/(lib)?(Expo|React|hermes|JavaScriptCore|jsc)|_RCT|_EXModule|_JSGlobalContextCreate|_JSContextGroupCreate'; then
            echo 'Forbidden native runtime dependency or symbol' >&2
            exit 1
        fi
    fi
done < <(rg --files --hidden --no-ignore --null "$app")
test "$native_binaries" -gt 0 || { echo 'No native executable found' >&2; exit 1; }

# A simulator build may be unsigned. Signed builds must have readable,
# exact configured entitlements; identity values stay in ignored build inputs.
if codesign -d "$app" >/dev/null 2>&1; then
    entitlements=$(codesign -d --entitlements :- "$app" 2>/dev/null)
    if test -n "$entitlements"; then
        printf '%s' "$entitlements" | swift "$native_root/scripts/configure-apple-services.swift" --verify-entitlements "$plist" app
    fi
fi
while IFS= read -r extension_info; do
    extension=${extension_info%/Info.plist}
    extension_name=$(/usr/libexec/PlistBuddy -c 'Print CFBundleDisplayName' "$extension_info" 2>/dev/null || true)
    test -n "$extension_name" || { echo 'Missing downloader display name' >&2; exit 1; }
    plutil -extract UIDeviceFamily json -o - "$extension_info" | jq -e '. == [1]' >/dev/null || {
        echo 'Expected iPhone-only downloader device family' >&2; exit 1;
    }
    if codesign -d "$extension" >/dev/null 2>&1; then
        extension_entitlements=$(codesign -d --entitlements :- "$extension" 2>/dev/null)
        test -n "$extension_entitlements" || { echo 'Missing downloader entitlements' >&2; exit 1; }
        printf '%s' "$extension_entitlements" | swift "$native_root/scripts/configure-apple-services.swift" --verify-entitlements "$plist" extension
    fi
done < <(rg --files --hidden --no-ignore "$app" | rg '/Extensions/[^/]+\.appex/Info\.plist$' || true)
echo 'PASS: iOS 26.0 minimum; compiled app icon; unchanged launch artwork; no excluded runtimes or unexpected entitlements.'
