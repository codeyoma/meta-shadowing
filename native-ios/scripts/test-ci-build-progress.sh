#!/bin/bash
set -euo pipefail

# Execute the actual workflow build commands against a controlled compiler
# boundary. The workflow must expose progress without paths and retain failures.
repository_root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$repository_root"

xcodebuild() {
    if [ "$1" != build-for-testing ]; then
        return 99
    fi
    printf '%s\n' \
        'SwiftCompile normal arm64 /private/example/lesson.swift' \
        'SwiftCompile normal arm64 /private/example/other.swift' \
        'SwiftEmitModule normal arm64 /private/example/module.swift' \
        'UNFILTERED_PRIVATE_PAYLOAD /private/example/account'
    if [ "$CI_BUILD_TEST_EXIT" = 0 ]; then
        printf '%s\n' '** TEST BUILD SUCCEEDED **'
    else
        printf '%s\n' \
            '/private/example/lesson.swift:1: error: UNFILTERED_PRIVATE_PAYLOAD' \
            '** TEST BUILD FAILED **'
    fi
    return "$CI_BUILD_TEST_EXIT"
}
export -f xcodebuild

ruby -ryaml -ropen3 -e '
  steps = YAML.load_file(ARGV.fetch(0)).fetch("jobs").fetch("ci-native-test-shards").fetch("steps")
  commands = steps.map { |step| step["run"] }.compact.select { |run| run.include?("xcodebuild build-for-testing") }
  abort "FAIL: expected both native test-product build commands" unless commands.length == 2
  commands.each do |command|
    [0, 42].each do |exit_code|
      output, status = Open3.capture2e(
        {"CI_BUILD_TEST_EXIT" => exit_code.to_s, "CI_SIMULATOR" => "synthetic-simulator",
         "RUNNER_TEMP" => "/private/example/build"}, "bash", "-e", "-c", command)
      abort "FAIL: build exit #{exit_code} became #{status.exitstatus}" unless status.exitstatus == exit_code
      abort "FAIL: private build output escaped the filter" if output.include?("/private/example") || output.include?("UNFILTERED_PRIVATE_PAYLOAD")
      abort "FAIL: compiler progress is missing" unless output.include?("Native build: SwiftCompile") && output.include?("Native build: SwiftEmitModule")
      abort "FAIL: repeated phases were not coalesced" unless output.scan("Native build: SwiftCompile").length == 1
      if exit_code != 0 && !output.include?("Native build: compiler error reported")
        abort "FAIL: error indication is missing"
      end
      verdict = exit_code == 0 ? "** TEST BUILD SUCCEEDED **" : "** TEST BUILD FAILED **"
      abort "FAIL: build verdict is missing" unless output.include?(verdict)
    end
  end
  puts "PASS: both workflow builds report safe progress and preserve compiler failure exit codes."
' .github/workflows/ci.yml
