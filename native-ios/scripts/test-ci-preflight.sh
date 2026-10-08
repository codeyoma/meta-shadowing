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
  abort "FAIL: preparation budgets changed" unless prepare["timeout-minutes"] == 5 && launch["timeout-minutes"] == 3
  Dir.mktmpdir("native-preflight") do |root|
    ["none", "bootstatus", "install", "launch"].each do |failure|
      env = {"RUNNER_TEMP" => root, "CI_SIMULATOR" => "synthetic-device", "IOS_TEST_RUNTIME" => "com.apple.CoreSimulator.SimRuntime.iOS-27-0", "GITHUB_OUTPUT" => File.join(root, "outputs"), "CI_PREFLIGHT_FAIL" => failure}
      output, status = Open3.capture2e(env, "bash", "-e", "-c", prepare.fetch("run"))
      if status.success?
        abort "FAIL: installation must finish during platform preparation" unless output.include?("Native preflight: install complete")
        launch_output, status = Open3.capture2e(env, "bash", "-e", "-c", launch.fetch("run"))
        output += launch_output
      end
      abort "FAIL: preflight lost failure status" unless status.exitstatus == (failure == "none" ? 0 : 42)
      abort "FAIL: private preflight output leaked" if output.include?("PRIVATE_PREFLIGHT_PAYLOAD") || output.include?("/private/profile") || output.include?("device-identifier")
      abort "FAIL: install progress order" unless output.include?("Native preflight: install begin") == (failure != "bootstatus")
      abort "FAIL: launch progress order" unless output.include?("Native preflight: launch begin") == ["none", "launch"].include?(failure)
      abort "FAIL: completion must follow successful launch" unless output.include?("Native preflight: launch complete") == (failure == "none")
    end
  end
  puts "PASS: preflight reports install/launch boundaries without private output or masked failures."
'
