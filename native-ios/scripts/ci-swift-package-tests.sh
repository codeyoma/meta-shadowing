#!/bin/bash
set -euo pipefail

ci_packages=()
while [[ "$#" -gt 0 ]]; do
    if [[ "$1" != --package || "$#" -lt 2 ]]; then
        echo 'Swift package tests: expected no arguments or repeated --package NAME; run from the repository root.' >&2
        exit 1
    fi
    case "$2" in
        LearningDomain|LearningPersistence|AppFoundation|LearningMedia|LearningReference|AppleServices) ;;
        *) echo 'Swift package tests: unknown package.' >&2; exit 1 ;;
    esac
    case " ${ci_packages[*]:-} " in *" $2 "*) echo 'Swift package tests: duplicate package.' >&2; exit 1 ;; esac
    ci_packages+=("$2")
    shift 2
done
if [[ "${#ci_packages[@]}" -eq 0 ]]; then
    ci_packages=(LearningDomain LearningPersistence AppFoundation LearningMedia LearningReference AppleServices)
fi

# Raw Swift output may contain local paths or test payloads. Keep it private.
umask 077
ci_logs=$(mktemp -d "${TMPDIR:-/tmp}/native-swift-package-tests.XXXXXX")
ci_succeeded=false
trap 'if "$ci_succeeded"; then rm -rf "$ci_logs"; fi' EXIT

fail_package() {
    echo "Swift package tests: $ci_package $1." >&2
    echo "Private diagnostics retained in temporary directory ${ci_logs##*/} ($ci_package.log); inspect locally." >&2
    exit 1
}

ci_total=0
for ci_package in "${ci_packages[@]}"; do
    if swift test --package-path "native-ios/Packages/$ci_package" >"$ci_logs/$ci_package.log" 2>&1; then
        :
    else
        ci_exit=$?
        fail_package "command failed (exit $ci_exit)"
    fi
    ci_result=$(ruby - "$ci_logs/$ci_package.log" 2>"$ci_logs/$ci_package.validation.log" <<'RUBY'
lines = File.read(ARGV.fetch(0)).lines.map(&:strip)
if lines.any? { |line| line.match?(/\A[✘✗↷]\s+(?:Test|Suite)\b/) ||
                         line.match?(/\A(?:[✔✓◇○]\s+)?(?:Test(?: case)?|Suite)\b.*\s(?:failed|skipped)(?: after [0-9]|[.:]|\z)/) ||
                         line.match?(/\ATest (?:Suite|Case)\b.*\s(?:failed|skipped)(?:\s|[.]|\z)/) }
  abort 'Swift Testing reported a failed or skipped test or suite'
end
summaries = lines.select { |line| line.match?(/\bTest run with\b/) }
abort 'expected exactly one Swift Testing final summary' unless summaries.length == 1
summary = summaries.first.match(/\A[✔✓] Test run with ([0-9]+) tests?(?: in [0-9]+ suites?)? passed after ([0-9]+(?:\.[0-9]+)?) seconds?\.\z/)
abort 'missing positive passed summary' unless summary && summary[1].to_i.positive?
puts "#{summary[1]} #{summary[2]}"
RUBY
    ) || fail_package 'did not pass result validation'
    read -r ci_count ci_seconds <<<"$ci_result"
    echo "$ci_package: $ci_count tests passed after $ci_seconds seconds."
    ci_total=$((ci_total + ci_count))
done

echo "PASS: $ci_total Swift package tests passed across ${#ci_packages[@]} packages."
ci_succeeded=true
