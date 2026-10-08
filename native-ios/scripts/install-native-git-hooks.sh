#!/bin/bash
set -euo pipefail

# Install only repository-local hooks. Existing hook policies remain user-owned.
simulator=''
if [[ $# -gt 0 ]]; then
  if [[ $# -ne 2 || "$1" != --simulator-id ]]; then
    echo 'Usage: install-native-git-hooks.sh [--simulator-id ID]' >&2
    exit 1
  fi
  simulator=$2
  if [[ ! "$simulator" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]; then
    echo 'Native hooks: simulator ID must be a UUID.' >&2
    exit 1
  fi
fi

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
test -f .githooks/pre-push
test -f native-ios/scripts/native-pre-push.rb
if hooks_path=$(git config --get core.hooksPath); then
  if [[ "$hooks_path" != .githooks ]]; then
    echo 'Native hooks: existing core.hooksPath conflicts; installation refused.' >&2
    exit 1
  fi
else
  default_hooks=$(git rev-parse --path-format=absolute --git-path hooks)
  for hook in "$default_hooks"/*; do
    [[ -e "$hook" ]] || continue
    [[ "$hook" == *.sample ]] && continue
    if [[ -f "$hook" && -x "$hook" ]]; then
      echo 'Native hooks: active default custom hook exists; installation refused.' >&2
      exit 1
    fi
  done
fi

chmod +x .githooks/pre-push
git config --local core.hooksPath .githooks
if [[ -n "$simulator" ]]; then
  git config --local native.prePushSimulator "$simulator"
fi
echo 'Native hooks: repository-local pre-push hook installed.'
if ! git config --local --get native.prePushSimulator >/dev/null; then
  echo 'Native hooks: configure native.prePushSimulator with a dedicated MetaShadowing Native Pre-push iOS 27 simulator before pushing.'
fi
