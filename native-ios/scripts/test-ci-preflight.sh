#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
xcrun() {
    printf '%s\n' 'PRIVATE_PREFLIGHT_PAYLOAD /private/profile device-identifier'
    if [ "$2" = "$CI_PREFLIGHT_FAIL" ]; then return 42; fi
}
uuidgen() { echo 'synthetic-profile'; }
export -f xcrun uuidgen
ruby -ryaml -rtmpdir -ropen3 -e '
  steps = YAML.load_file(".github/workflows/ci.yml")["jobs"]["ci-native-test-shards"]["steps"]
  command = steps.find { |step| step["name"] == "Verify isolated app launch before XCTest" }.fetch("run")
  Dir.mktmpdir("native-preflight") do |root|
    ["none", "install", "launch"].each do |failure|
      output, status = Open3.capture2e({"RUNNER_TEMP" => root, "CI_SIMULATOR" => "synthetic-device", "CI_PREFLIGHT_FAIL" => failure}, "bash", "-e", "-c", command)
      abort "FAIL: preflight lost failure status" unless status.exitstatus == (failure == "none" ? 0 : 42)
      abort "FAIL: private preflight output leaked" if output.include?("PRIVATE_PREFLIGHT_PAYLOAD") || output.include?("/private/profile") || output.include?("device-identifier")
      abort "FAIL: install progress missing" unless output.include?("Native preflight: install begin")
      abort "FAIL: launch progress order" unless output.include?("Native preflight: launch begin") == (failure != "install")
      abort "FAIL: completion must follow successful launch" unless output.include?("Native preflight: launch complete") == (failure == "none")
    end
  end
  puts "PASS: preflight reports install/launch boundaries without private output or masked failures."
'
