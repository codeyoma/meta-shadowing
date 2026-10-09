#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
xcrun() {
    if [ "$2" = list ]; then
        printf '%s\n' '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-27-0":[{"isAvailable":true,"name":"iPhone fixture","udid":"synthetic-device"}]}}'
        return 0
    fi
    printf '%s\n' 'PRIVATE_PREFLIGHT_PAYLOAD /private/profile device-identifier'
    if [ "$2" = "$CI_PREFLIGHT_FAIL" ]; then return 42; fi
}
uuidgen() { echo 'synthetic-profile'; }
export -f xcrun uuidgen
ruby -ryaml -rtmpdir -ropen3 -e '
  steps = YAML.load_file(".github/workflows/ci.yml")["jobs"]["ci-native-test-shards"]["steps"]
  prepare = steps.find { |step| step["id"] == "simulator" }
  launch = steps.find { |step| step["name"] == "Verify isolated app launch before XCTest" }
  abort "FAIL: readiness must share the existing eight-minute total budget" unless prepare["timeout-minutes"] == 8 && launch.nil?
  abort "FAIL: expensive resource snapshots must not run in regular CI" if steps.any? { |step| step.fetch("run", "").include?("bash native-ios/scripts/ci-simulator-resources.sh") }
  Dir.mktmpdir("native-preflight") do |root|
    ["none", "bootstatus", "install", "launch"].each do |failure|
      outputs = File.join(root, "outputs-#{failure}")
      env = {"RUNNER_TEMP" => root, "IOS_TEST_RUNTIME" => "com.apple.CoreSimulator.SimRuntime.iOS-27-0", "GITHUB_OUTPUT" => outputs, "CI_PREFLIGHT_FAIL" => failure}
      output, status = Open3.capture2e(env, "bash", "-e", "-c", prepare.fetch("run"))
      abort "FAIL: preflight lost failure status" unless status.exitstatus == (failure == "none" ? 0 : 42)
      abort "FAIL: private preflight output leaked" if output.include?("PRIVATE_PREFLIGHT_PAYLOAD") || output.include?("/private/profile") || output.include?("device-identifier")
      abort "FAIL: install progress order" unless output.include?("Native preflight: install begin") == (failure != "bootstatus")
      abort "FAIL: launch progress order" unless output.include?("Native preflight: launch begin") == ["none", "launch"].include?(failure)
      abort "FAIL: completion must follow successful launch" unless output.include?("Native preflight: launch complete") == (failure == "none")
      abort "FAIL: simulator must be published only after readiness succeeds" unless File.exist?(outputs) == (failure == "none")
    end
  end
  puts "PASS: preflight reports install/launch boundaries without private output or masked failures."
'
