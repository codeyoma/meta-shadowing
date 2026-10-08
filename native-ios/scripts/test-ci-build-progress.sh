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
    for argument in "$@"; do
        case "$argument" in -only-testing:*|-skip-testing:*) return 98 ;; esac
    done
    printf '%s\n' \
        'Resolve Package Graph /private/example' \
        'ComputeTargetDependencyGraph /private/example' \
        'SwiftExplicitDependencyCompileModuleFromInterface /private/example' \
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
  jobs = YAML.load_file(ARGV.fetch(0)).fetch("jobs")
  abort "FAIL: shared build job missing" unless jobs.key?("ci-native-build")
  shards = jobs.fetch("ci-native-test-shards")
  abort "FAIL: test runners must depend on shared build" unless Array(shards["needs"]).include?("ci-native-build")
  gate_needs = Array(jobs.fetch("ci-native-tests")["needs"])
  abort "FAIL: aggregate must observe both producer and consumers" unless gate_needs.include?("ci-native-build") && gate_needs.include?("ci-native-test-shards")
  abort "FAIL: aggregate must report cancelled dependencies" unless jobs.fetch("ci-native-tests")["if"] == "always()"
  steps = jobs.fetch("ci-native-build").fetch("steps")
  abort "FAIL: simulator boot must not compete with shared compilation" if steps.any? { |step| step.fetch("run", "").include?("simctl boot") }
  abort "FAIL: test runners must not compile again" if shards.fetch("steps").any? { |step| step.fetch("run", "").include?("build-for-testing") }
  commands = steps.map { |step| step["run"] }.compact.select { |run| run.include?("xcodebuild build-for-testing") }
  abort "FAIL: expected one complete native test-product build command" unless commands.length == 1
  commands.each do |command|
    [0, 42].each do |exit_code|
      output, status = Open3.capture2e(
        {"CI_BUILD_TEST_EXIT" => exit_code.to_s, "CI_SIMULATOR" => "synthetic-simulator",
         "RUNNER_TEMP" => "/private/example/build"}, "bash", "-e", "-c", command)
      abort "FAIL: build exit #{exit_code} became #{status.exitstatus}" unless status.exitstatus == exit_code
      abort "FAIL: private build output escaped the filter" if output.include?("/private/example") || output.include?("UNFILTERED_PRIVATE_PAYLOAD")
      abort "FAIL: compiler progress is missing" unless output.include?("Native build: SwiftCompile") && output.include?("Native build: SwiftEmitModule")
      abort "FAIL: build preparation progress is missing" unless output.include?("Native build: ResolvePackageGraph") && output.include?("Native build: ComputeTargetDependencyGraph") && output.include?("Native build: SwiftExplicitDependencyCompileModuleFromInterface")
      abort "FAIL: repeated phases were not coalesced" unless output.scan("Native build: SwiftCompile").length == 1
      if exit_code != 0 && !output.include?("Native build: compiler error reported")
        abort "FAIL: error indication is missing"
      end
      verdict = exit_code == 0 ? "** TEST BUILD SUCCEEDED **" : "** TEST BUILD FAILED **"
      abort "FAIL: build verdict is missing" unless output.include?(verdict)
    end
  end
  puts "PASS: the workflow build reports safe progress and preserves compiler failure exit codes."
' .github/workflows/ci.yml
