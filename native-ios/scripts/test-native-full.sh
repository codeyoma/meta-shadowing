#!/bin/bash
# NATIVE_FULL_CONTRACT_VERSION=5
set -euo pipefail
command -v ruby >/dev/null || { echo 'FAIL: Required tool unavailable: ruby' >&2; exit 1; }
exec ruby "$(dirname "$0")/native-simulator-lease.rb" "$@"
