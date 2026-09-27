#!/bin/bash
set -euo pipefail
shopt -s nocasematch

for tool in rg jq file otool nm codesign plutil; do
    command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done

app=${1:?Usage: bash native-ios/scripts/verify-native-product.sh PATH_TO_APP}
plist="$app/Info.plist"
test -f "$plist" || { echo 'Missing app Info.plist' >&2; exit 1; }
executable=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$plist")
test -f "$app/$executable" || { echo 'Missing app executable' >&2; exit 1; }
minimum=$(/usr/libexec/PlistBuddy -c 'Print MinimumOSVersion' "$plist")
test "$minimum" = '26.0' || { echo 'Unexpected deployment minimum' >&2; exit 1; }

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
        dependencies=$(otool -L "$artifact")
        symbols=$(nm -u "$artifact")
        if printf '%s\n%s\n' "$dependencies" "$symbols" |
            grep -Eiq '/(lib)?(Expo|React|hermes|JavaScriptCore|jsc)|_RCT|_EXModule|_JSGlobalContextCreate|_JSContextGroupCreate'; then
            echo 'Forbidden native runtime dependency or symbol' >&2
            exit 1
        fi
    fi
done < <(rg --files --hidden --no-ignore --null "$app")
test "$native_binaries" -gt 0 || { echo 'No native executable found' >&2; exit 1; }

# A simulator build may be unsigned. Signed builds must have readable,
# minimal entitlements; service capabilities are outside the W2 shell.
if codesign -d "$app" >/dev/null 2>&1; then
    entitlements=$(codesign -d --entitlements :- "$app" 2>/dev/null)
    if test -n "$entitlements"; then
        keys=$(printf '%s' "$entitlements" | plutil -convert json -o - -- - | jq -r 'keys[]')
        while IFS= read -r key; do
            case "$key" in
                ''|application-identifier|com.apple.developer.team-identifier|get-task-allow|com.apple.security.get-task-allow) ;;
                *) echo 'Unexpected app entitlement' >&2; exit 1 ;;
            esac
        done <<< "$keys"
    fi
fi
echo 'PASS: iOS 26.0 minimum; no excluded runtimes, JS resources or service entitlements.'
