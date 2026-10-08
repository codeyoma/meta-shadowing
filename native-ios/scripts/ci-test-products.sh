#!/bin/bash
set -euo pipefail

# A run-scoped transport, not a cross-commit build cache. Never fall back to a rebuild.
fail() { echo "Native test products: $1" >&2; exit 1; }
test "$#" = 3 || fail 'expected pack/unpack and two paths'
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'missing checkout revision'
ci_toolchain=$(xcodebuild -version) || fail 'toolchain unavailable'
ci_stage=$(mktemp -d "${TMPDIR:-/tmp}/native-test-products.XXXXXX")
trap 'rm -rf "$ci_stage"' EXIT

validate_products() {
    test -f "$1/NativeTests.xctestproducts/Info.plist" &&
    test -f "$1/NativeTests.xctestproducts/Tests/0/MetaShadowingNative.xctestrun" &&
    test -x "$1/NativeTests.xctestproducts/Binaries/0/Debug-iphonesimulator/MetaShadowingNative.app/MetaShadowingNative" ||
        fail 'complete test products or executable are missing'
}

case "$1" in
    pack)
        validate_products "$2"
        COPYFILE_DISABLE=1 tar -czf "$ci_stage/products.tar.gz" -C "$2" NativeTests.xctestproducts 2>/dev/null || fail 'packaging failed'
        ci_digest=$(shasum -a 256 "$ci_stage/products.tar.gz" | cut -d ' ' -f 1)
        jq -n --arg revision "$GITHUB_SHA" --arg toolchain "$ci_toolchain" --arg digest "$ci_digest" \
            '{revision: $revision, toolchain: $toolchain, sha256: $digest}' > "$ci_stage/metadata.json"
        COPYFILE_DISABLE=1 tar -cf "$3" -C "$ci_stage" metadata.json products.tar.gz 2>/dev/null || fail 'archive creation failed'
        echo "Native test products: packaged $(du -k "$3" | cut -f 1) KiB"
        ;;
    unpack)
        test ! -e "$3" || fail 'destination must be new'
        tar -xf "$2" -C "$ci_stage" metadata.json products.tar.gz 2>/dev/null || fail 'invalid archive'
        for ci_file in metadata.json products.tar.gz; do
            test -f "$ci_stage/$ci_file" && test ! -L "$ci_stage/$ci_file" || fail 'invalid archive entries'
        done
        ci_digest=$(shasum -a 256 "$ci_stage/products.tar.gz" | cut -d ' ' -f 1)
        jq -e --arg revision "$GITHUB_SHA" --arg toolchain "$ci_toolchain" --arg digest "$ci_digest" \
            '.revision == $revision and .toolchain == $toolchain and .sha256 == $digest' \
            "$ci_stage/metadata.json" >/dev/null 2>&1 || fail 'revision, toolchain or checksum mismatch'
        tar -tzf "$ci_stage/products.tar.gz" 2>/dev/null | awk '
            !/^NativeTests[.]xctestproducts\// || /(^|\/)\.\.?(\/|$)/ { invalid = 1 }
            END { exit invalid }
        ' || fail 'invalid product paths'
        mkdir "$3"
        tar -xzf "$ci_stage/products.tar.gz" -C "$3" 2>/dev/null || fail 'product extraction failed'
        validate_products "$3"
        echo 'Native test products: revision, toolchain and checksum verified'
        ;;
    *) fail 'unknown operation' ;;
esac
