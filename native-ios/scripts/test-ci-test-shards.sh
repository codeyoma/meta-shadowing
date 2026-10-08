#!/bin/bash
set -euo pipefail

# Exercise the workflow's actual XCTest invocation at the process boundary.
# Catch missing/duplicate coverage and preserve failures through its log filter.
repository_root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$repository_root"

xcodebuild() {
    if [[ " $* " == *" -enumerate-tests "* ]]; then
        printf '%s\n' "$@" > "$CI_INVENTORY_ARGUMENTS"
        return "${CI_INVENTORY_EXIT:-0}"
    fi
    printf '%s\n' "$@" > "$CI_TEST_ARGUMENTS"
    if [ "$CI_TEST_EXIT" = 0 ]; then
        printf '%s\n' '** TEST EXECUTE SUCCEEDED **'
    else
        printf '%s\n' '** TEST EXECUTE FAILED **'
    fi
    return "$CI_TEST_EXIT"
}
export -f xcodebuild

ruby -ryaml -rjson -ropen3 -rtmpdir -e '
  jobs = YAML.load_file(ARGV.fetch(0)).fetch("jobs")
  job = jobs.fetch("ci-native-test-shards")
  shards = %w[player player-options product remaining fast-player fast-native]
  commands = job.fetch("steps").map { |step| step["run"] }.compact
    .select { |run| run.include?("xcodebuild test-without-building") }
  abort "FAIL: expected one XCTest execution command" unless commands.length == 1
  selections = []
  expected_fast = {
    "fast-player" => %w[
      -only-testing:NativeFoundationUITests/PlayerUITests/testRealAudioConfirmationAndPausedMenu
      -only-testing:NativeFoundationUITests/PlayerUITests/testInstalledLessonReopensWithoutServiceAccessOrExtraCredit
      -only-testing:NativeFoundationUITests/PlayerUITests/testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay
      -only-testing:NativeFoundationUITests/PlayerUITests/testAllSentencesSelectsPausedWithoutCredit
    ],
    "fast-native" => %w[
      -only-testing:NativeMediaIntegrationTests
      -only-testing:NativeFoundationUITests/NativeFoundationUITests/testRetryRemainsReachableAtLargestText
      -only-testing:NativeFoundationUITests/ReferenceToolsUITests/testSingleSentenceOpensDetailAndBackDismissesToPausedLearning
      -only-testing:NativeFoundationUITests/VoiceOverSemanticsUITests/testVoiceOverLabelsValuesAndOrder
      -only-testing:NativeFoundationUITests/ProductAccessibilityUITests/testLongHintTextDoesNotLeakAndControlsStayReachable
    ]
  }
  Dir.mktmpdir("native-ci-shards") do |directory|
    arguments_path = File.join(directory, "arguments")
    inventory_path = File.join(directory, "inventory-arguments")
    base_env = job.fetch("env").merge(
      "CI_SIMULATOR" => "synthetic-simulator", "RUNNER_TEMP" => directory,
      "CI_TEST_ARGUMENTS" => arguments_path, "CI_INVENTORY_ARGUMENTS" => inventory_path)
    shards.each do |shard|
      [0, 42].each do |exit_code|
        File.delete(arguments_path) if File.exist?(arguments_path)
        File.delete(inventory_path) if File.exist?(inventory_path)
        selection_path = File.join(directory, "native-selection.json")
        File.delete(selection_path) if File.exist?(selection_path)
        output, status = Open3.capture2e(base_env.merge(
          "CI_TEST_SHARD" => shard, "CI_TEST_EXIT" => exit_code.to_s),
          "bash", "-e", "-c", commands.first)
        abort "FAIL: #{shard} test exit #{exit_code} became #{status.exitstatus}: #{output}" unless status.exitstatus == exit_code
        arguments = File.readlines(arguments_path, chomp: true)
        abort "FAIL: #{shard} did not execute prepared tests" unless arguments.first == "test-without-building"
        products = arguments.index("-testProductsPath")
        abort "FAIL: #{shard} must use the shared products" unless products && arguments[products + 1] == File.join(directory, "native-tests/NativeTests.xctestproducts")
        abort "FAIL: #{shard} must not use source builds" if arguments.include?("-project") || arguments.include?("-derivedDataPath")
        parallel = arguments.index("-parallel-testing-enabled")
        abort "FAIL: #{shard} must use one serial simulator" unless parallel && arguments[parallel + 1] == "NO"
        abort "FAIL: #{shard} must enumerate complete compiled products before testing" unless File.exist?(inventory_path)
        inventory = File.readlines(inventory_path, chomp: true)
        abort "FAIL: #{shard} enumeration must not select or skip tests" unless inventory.grep(/\A-(only|skip)-testing/).empty?
        %w[-testProductsPath -destination].each do |flag|
          at = inventory.index(flag)
          abort "FAIL: #{shard} enumeration must use the execution #{flag}" unless at && inventory[at + 1] == arguments[arguments.index(flag) + 1]
        end
        output = inventory.index("-test-enumeration-output-path")
        abort "FAIL: #{shard} inventory must be retained for result validation" unless output && inventory[output + 1] == File.join(directory, "native-inventory.json")
        selection = arguments.grep(/\A-(only|skip)-testing:/)
        abort "FAIL: #{shard} must retain the exact selection for result validation" unless File.exist?(selection_path) && JSON.parse(File.read(selection_path)) == selection
        abort "FAIL: #{shard} changed its agreed fast coverage" if expected_fast.key?(shard) && selection != expected_fast.fetch(shard)
        selections << [shard, arguments] if exit_code == 0
      end
    end
    File.delete(arguments_path)
    _, status = Open3.capture2e(base_env.merge("CI_TEST_SHARD" => "unknown", "CI_TEST_EXIT" => "0"),
      "bash", "-e", "-c", commands.first)
    abort "FAIL: an unknown shard must fail before XCTest" if status.success? || File.exist?(arguments_path)
    _, status = Open3.capture2e(base_env.merge("CI_TEST_SHARD" => "fast-native", "CI_TEST_EXIT" => "0", "CI_INVENTORY_EXIT" => "41"),
      "bash", "-e", "-c", commands.first)
    abort "FAIL: inventory failure must fail before XCTest" unless status.exitstatus == 41 && !File.exist?(arguments_path)
  end

  # Literal routes cover moved classes plus future tests, classes and targets.
  # Selection is determined only from arguments emitted by the real workflow.
  routes = {
    "NativeFoundationUITests/PlayerUITests/testPlayer" => "player",
    "NativeFoundationUITests/PlayerUITests/testFuturePlayer" => "player",
    "NativeFoundationUITests/PlayerUITests/testPausedRateEditorKeepsGlobalPreferenceSeparate" => "player",
    "NativeFoundationUITests/PlayerUITests/testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages" => "player-options",
    "NativeFoundationUITests/PlayerUITests/testSubtitleToggleAppearsOnlyForHintStages" => "player-options",
    "NativeFoundationUITests/ProductUITests/testSettings" => "product",
    "NativeFoundationUITests/ProductUITests/testLearningSettingsSummariesFollowSavedOptionsAcrossRelaunch" => "player-options",
    "NativeFoundationUITests/ProductUITests/testFontSettingsPersistAcrossRelaunch" => "player-options",
    "NativeFoundationUITests/ProductUITests/testRateEditorShowsOnlyLiveValueAndPersistsPreference" => "player-options",
    "NativeFoundationUITests/AppleServicesUITests/testRecovery" => "product",
    "NativeFoundationUITests/VoiceOverSemanticsUITests/testLargestText" => "product",
    "NativeFoundationUITests/BookshelfUITests/testCard" => "remaining",
    "NativeFoundationUITests/OfflineAcceptanceUITests/testOffline" => "player",
    "NativeFoundationUITests/OfflineAcceptanceUITests/testFutureOffline" => "player",
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
  # Every current UI method must run once; unnamed future classes remain covered.
  extra = job.fetch("env").fetch("CI_OPTIONS_EXTRA_TESTS", "").split
  actual = Dir.glob("native-ios/Tests/AppUITests/*.swift").flat_map do |path|
    source = File.read(path)
    name = source[/class (\w+)\s*:\s*XCTestCase/, 1]
    next [] unless name
    source.scan(/func (test\w+)\(/).flatten.map { |method| "NativeFoundationUITests/#{name}/#{method}" }
  end
  abort "FAIL: invalid extra options selections" unless extra.uniq == extra && (extra - actual).empty?
  fast_ui = expected_fast.values.flatten.reject { |flag| flag == "-only-testing:NativeMediaIntegrationTests" }
    .map { |flag| flag.delete_prefix("-only-testing:") }
  abort "FAIL: fast UI selections must name current tests" unless (fast_ui - actual).empty?
  abort "FAIL: extra options tests must leave the product shard" unless extra.all? { |test| job.fetch("env").fetch("CI_PRODUCT_TEST_CLASSES").split.any? { |prefix| test.start_with?(prefix + "/") } }
  actual.each do |test|
    next if routes.key?(test)
    owner = if extra.include?(test) then "player-options"
      elsif test.start_with?("NativeFoundationUITests/PlayerUITests/", "NativeFoundationUITests/OfflineAcceptanceUITests/") then "player"
      elsif job.fetch("env").fetch("CI_PRODUCT_TEST_CLASSES").split.any? { |prefix| test.start_with?(prefix + "/") } then "product"
      else "remaining" end
    routes[test] = owner
  end
  routes.each do |test, expected|
    owners = selections.reject { |shard, _| shard.start_with?("fast-") }.map do |shard, arguments|
      only = arguments.grep(/\A-only-testing:/).map { |arg| arg.delete_prefix("-only-testing:") }
      skip = arguments.grep(/\A-skip-testing:/).map { |arg| arg.delete_prefix("-skip-testing:") }
      matches = ->(prefix) { test == prefix || test.start_with?(prefix + "/") }
      shard if (only.empty? || only.any?(&matches)) && skip.none?(&matches)
    end.compact
    abort "FAIL: #{test} must run only in #{expected}, got #{owners.inspect}" unless owners == [expected]
  end

  gate = jobs.fetch("ci-native-tests").fetch("steps").find { |step| step["run"] }.fetch("run")
  ["success", "failure", "cancelled", "skipped", ""].repeated_permutation(3) do |profile, build, result|
    _, status = Open3.capture2e({"PROFILE_RESULT" => profile, "BUILD_RESULT" => build, "SHARD_RESULT" => result}, "bash", "-e", "-c", gate)
    abort "FAIL: aggregate gate accepted #{[profile, build, result].inspect} incorrectly" unless status.success? == (profile == "success" && build == "success" && result == "success")
  end
  puts "PASS: full shards partition coverage once; fast shards retain selected journeys and complete integration; inventory, serial execution and failures are enforced."
' .github/workflows/ci.yml
