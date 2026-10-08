#!/bin/bash
set -euo pipefail

# Exercise the workflow's actual XCTest invocation at the process boundary.
# Catch missing/duplicate coverage and preserve failures through its log filter.
repository_root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$repository_root"

xcodebuild() {
    printf '%s\n' "$@" > "$CI_TEST_ARGUMENTS"
    if [ "$CI_TEST_EXIT" = 0 ]; then
        printf '%s\n' '** TEST EXECUTE SUCCEEDED **'
    else
        printf '%s\n' '** TEST EXECUTE FAILED **'
    fi
    return "$CI_TEST_EXIT"
}
export -f xcodebuild

ruby -ryaml -ropen3 -rtmpdir -e '
  jobs = YAML.load_file(ARGV.fetch(0)).fetch("jobs")
  job = jobs.fetch("ci-native-test-shards")
  shards = job.fetch("strategy").fetch("matrix").fetch("shard")
  commands = job.fetch("steps").map { |step| step["run"] }.compact
    .select { |run| run.include?("xcodebuild test-without-building") }
  abort "FAIL: expected one XCTest execution command" unless commands.length == 1
  selections = []
  Dir.mktmpdir("native-ci-shards") do |directory|
    arguments_path = File.join(directory, "arguments")
    base_env = job.fetch("env").merge(
      "CI_SIMULATOR" => "synthetic-simulator", "RUNNER_TEMP" => directory,
      "CI_TEST_ARGUMENTS" => arguments_path)
    shards.each do |shard|
      [0, 42].each do |exit_code|
        File.delete(arguments_path) if File.exist?(arguments_path)
        output, status = Open3.capture2e(base_env.merge(
          "CI_TEST_SHARD" => shard, "CI_TEST_EXIT" => exit_code.to_s),
          "bash", "-e", "-c", commands.first)
        abort "FAIL: #{shard} test exit #{exit_code} became #{status.exitstatus}: #{output}" unless status.exitstatus == exit_code
        arguments = File.readlines(arguments_path, chomp: true)
        abort "FAIL: #{shard} did not execute prepared tests" unless arguments.first == "test-without-building"
        parallel = arguments.index("-parallel-testing-enabled")
        abort "FAIL: #{shard} must use one serial simulator" unless parallel && arguments[parallel + 1] == "NO"
        selections << [shard, arguments] if exit_code == 0
      end
    end
    File.delete(arguments_path)
    _, status = Open3.capture2e(base_env.merge("CI_TEST_SHARD" => "unknown", "CI_TEST_EXIT" => "0"),
      "bash", "-e", "-c", commands.first)
    abort "FAIL: an unknown shard must fail before XCTest" if status.success? || File.exist?(arguments_path)
  end

  # Literal routes cover moved classes plus future tests, classes and targets.
  # Selection is determined only from arguments emitted by the real workflow.
  routes = {
    "NativeFoundationUITests/PlayerUITests/testPlayer" => "player",
    "NativeFoundationUITests/PlayerUITests/testFuturePlayer" => "player",
    "NativeFoundationUITests/PlayerUITests/testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages" => "player-options",
    "NativeFoundationUITests/PlayerUITests/testSubtitleToggleAppearsOnlyForHintStages" => "player-options",
    "NativeFoundationUITests/ProductUITests/testSettings" => "product",
    "NativeFoundationUITests/AppleServicesUITests/testRecovery" => "product",
    "NativeFoundationUITests/VoiceOverSemanticsUITests/testLargestText" => "product",
    "NativeFoundationUITests/BookshelfUITests/testCard" => "remaining",
    "NativeFoundationUITests/OfflineAcceptanceUITests/testOffline" => "remaining",
    "NativeFoundationUITests/FutureUITests/testFutureUI" => "remaining",
    "NativeMediaIntegrationTests/NativeLifecycleTests/testReopen" => "remaining",
    "FutureTarget/FutureTests/testFutureTarget" => "remaining"
  }
  player_methods = File.read("native-ios/Tests/AppUITests/PlayerUITests.swift")
    .scan(/func (test\w+)\(/).flatten
  option_methods = job.fetch("env").fetch("CI_PLAYER_OPTIONS_TEST_METHODS", "").split
  abort "FAIL: duplicate player option methods" unless option_methods.uniq == option_methods
  unknown_methods = option_methods - player_methods
  abort "FAIL: unknown player option methods: #{unknown_methods.inspect}" unless unknown_methods.empty?
  player_methods.each do |method|
    routes["NativeFoundationUITests/PlayerUITests/#{method}"] ||=
      option_methods.include?(method) ? "player-options" : "player"
  end
  routes.each do |test, expected|
    owners = selections.map do |shard, arguments|
      only = arguments.grep(/\A-only-testing:/).map { |arg| arg.delete_prefix("-only-testing:") }
      skip = arguments.grep(/\A-skip-testing:/).map { |arg| arg.delete_prefix("-skip-testing:") }
      matches = ->(prefix) { test == prefix || test.start_with?(prefix + "/") }
      shard if (only.empty? || only.any?(&matches)) && skip.none?(&matches)
    end.compact
    abort "FAIL: #{test} must run only in #{expected}, got #{owners.inspect}" unless owners == [expected]
  end

  gate = jobs.fetch("ci-native-tests").fetch("steps").find { |step| step["run"] }.fetch("run")
  ["success", "failure", "cancelled", "skipped", ""].each do |result|
    _, status = Open3.capture2e({"SHARD_RESULT" => result}, "bash", "-e", "-c", gate)
    abort "FAIL: aggregate gate accepted #{result.inspect} incorrectly" unless status.success? == (result == "success")
  end
  puts "PASS: native shards partition coverage once, preserve serial execution and failures, and fail closed."
' .github/workflows/ci.yml
