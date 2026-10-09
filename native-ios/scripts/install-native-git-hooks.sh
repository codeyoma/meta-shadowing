#!/bin/bash
set -euo pipefail

# Install only repository-local hooks. Existing hook policies remain user-owned.
simulator=''
secondary_simulator=''
usage() {
  echo 'Usage: install-native-git-hooks.sh [--simulator-id ID [--secondary-simulator-id ID]]' >&2
  exit 1
}
valid_uuid() {
  [[ "$1" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]
}
configured_simulator() {
  ruby -ropen3 - "$1" <<'RUBY'
output, status = Open3.capture2e('git', 'config', '--local', '--null', '--get-all', ARGV.fetch(0))
exit 0 if status.exitstatus == 1
values = output.split("\0", -1)
terminator = values.pop
unless status.success? && terminator == '' && values.length == 1 &&
       values.first.match?(/\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z/)
  warn 'Native hooks: existing simulator configuration must contain one UUID per setting.'
  exit 1
end
puts values.first
RUBY
}
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || usage
  case "$1" in
    --simulator-id)
      [[ -z "$simulator" ]] || usage
      simulator=$2
      ;;
    --secondary-simulator-id)
      [[ -z "$secondary_simulator" ]] || usage
      secondary_simulator=$2
      ;;
    *) usage ;;
  esac
  if ! valid_uuid "$2"; then
    echo 'Native hooks: simulator ID must be a UUID.' >&2
    exit 1
  fi
  shift 2
done
[[ -z "$secondary_simulator" || -n "$simulator" ]] || usage

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
configured_primary=$(configured_simulator native.prePushSimulator)
configured_secondary=$(configured_simulator native.prePushSecondarySimulator)
effective_simulator=${simulator:-$configured_primary}
effective_secondary=${secondary_simulator:-$configured_secondary}
if [[ -n "$effective_secondary" ]]; then
  if [[ -z "$effective_simulator" ]] ||
     [[ "$(printf '%s' "$effective_simulator" | tr '[:lower:]' '[:upper:]')" == "$(printf '%s' "$effective_secondary" | tr '[:lower:]' '[:upper:]')" ]]; then
    echo 'Native hooks: primary and secondary simulator IDs must be present and distinct.' >&2
    exit 1
  fi
fi

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
if [[ -n "$secondary_simulator" ]]; then
  git config --local native.prePushSecondarySimulator "$secondary_simulator"
fi
echo 'Native hooks: repository-local pre-push hook installed.'
if ! git config --local --get native.prePushSimulator >/dev/null; then
  echo 'Native hooks: configure native.prePushSimulator with a dedicated MetaShadowing Native Pre-push iOS 27 simulator before pushing.'
fi
