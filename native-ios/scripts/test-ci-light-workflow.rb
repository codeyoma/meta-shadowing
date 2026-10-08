#!/usr/bin/env ruby
# Execute the workflow's real shell commands with compiler, simulator and script
# boundaries controlled. No Xcode project, app or simulator is changed by this test.
require 'yaml'
require 'json'
require 'open3'
require 'tmpdir'
require 'minitest/autorun'

class LightWorkflowTests < Minitest::Test
  ROOT = File.expand_path('../..', __dir__)
  WORKFLOW = YAML.load_file(File.join(ROOT, '.github/workflows/ci.yml'))
  JOBS = WORKFLOW.fetch('jobs')
  FULL_CONDITION = "github.event_name == 'workflow_dispatch' && needs.ci-branch-policy.outputs.test-scope == 'full'"
  BOUNDARIES = <<~'BASH'
    record() { printf '%s\n' "$*" >> "$CI_COMMAND_LOG"; }
    xcodebuild() {
      record "xcodebuild $*"
      case "$1" in -version) return 0 ;; build) return "${CI_COMPILE_EXIT:-0}" ;; *) return 96 ;; esac
    }
    xcrun() { record "xcrun $*"; return 97; }
    xcodegen() { record "xcodegen $*"; }
    swift() { record "swift $*"; }
    ruby() { record "ruby $*"; }
    rg() { record "rg $*"; }
    jq() { record "jq $*"; }
    bash() {
      record "bash $*"
      case "$1" in
        native-ios/scripts/verify-native-product.sh)
          test "$3" = Debug || test "$3" = Release ;;
        native-ios/scripts/ci-swift-package-tests.sh) return "${CI_PACKAGE_EXIT:-0}" ;;
        native-ios/scripts/*.sh) return 0 ;;
        *) return 98 ;;
      esac
    }
  BASH

  def selected?(condition, event_name, scope)
    return true unless condition
    return true if condition == 'always()'
    assert_equal FULL_CONDITION, condition, 'Every expensive operation must require explicit dispatch full.'
    event_name == 'workflow_dispatch' && scope == 'full'
  end

  def scope_for(name, event)
    output, error, status = Open3.capture3({'GITHUB_EVENT_NAME' => name}, 'node',
      'native-ios/scripts/ci-test-profile.mjs', stdin_data: JSON.generate(event), chdir: ROOT)
    assert status.success?, error
    output.lines.find { |line| line.start_with?('test-scope=') }.strip.split('=', 2).last
  end

  def execute_light(name, event, extra_env = {})
    scope = scope_for(name, event)
    commands = []
    actions = []
    %w[ci-quality ci-swift-tests ci-native-build ci-native-test-shards ci-ios-build].each do |id|
      assert JOBS.key?(id), "Required #{id} job is missing."
      job = JOBS.fetch(id)
      next unless selected?(job['if'], name, scope)
      job.fetch('steps').each do |step|
        next unless selected?(step['if'], name, scope)
        commands << step['run'] if step['run']
        actions << step['uses'] if step['uses']
      end
    end
    Dir.mktmpdir('native-light-workflow') do |directory|
      path = File.join(directory, 'commands')
      output, status = Open3.capture2e({'RUNNER_TEMP' => directory, 'CI_COMMAND_LOG' => path}.merge(extra_env),
        '/bin/bash', '-e', '-c', BOUNDARIES + commands.join("\n"), chdir: ROOT)
      yield File.readlines(path, chomp: true), actions, status, output
    end
  end

  def test_ordinary_events_and_manual_light_execute_one_unsigned_debug_build_without_simulator_work
    [
      ['pull_request', {pull_request: {base: {ref: 'dev'}}}],
      ['pull_request', {pull_request: {base: {ref: 'main'}}}],
      ['push', {ref: 'refs/heads/dev'}],
      ['push', {ref: 'refs/heads/main'}],
      ['workflow_dispatch', {inputs: {test_scope: 'light'}}]
    ].each do |name, event|
      execute_light(name, event) do |calls, actions, status, output|
        assert status.success?, output
        builds = calls.grep(/^xcodebuild build /)
        assert_equal 1, builds.length, "#{name} must execute exactly one app compile."
        assert_includes builds.first, '-configuration Debug'
        assert_includes builds.first, "-destination generic/platform=iOS Simulator"
        assert_includes builds.first, 'CODE_SIGNING_ALLOWED=NO'
        assert_equal 1, calls.grep(%r{^bash native-ios/scripts/verify-native-product.sh .* Debug$}).length
        assert_equal 1, calls.count('bash native-ios/scripts/ci-swift-package-tests.sh')
        assert_equal 1, calls.count('swift native-ios/scripts/configure-apple-services.swift --self-test'),
          "#{name} must execute the cheap service-configuration contract."
        assert_empty calls.grep(/xcrun|build-for-testing|test-without-building|enumerate-tests|testProductsPath|configuration Release|test-service-build|test-native-runtime-inspection|ci-test-products.sh (pack|unpack)/)
        assert_empty actions.grep(/upload-artifact|download-artifact/)
      end
    end
  end

  def test_compiler_and_package_failures_stop_actual_light_commands
    [{'CI_COMPILE_EXIT' => '42'}, {'CI_PACKAGE_EXIT' => '43'}].each do |env|
      execute_light('push', {ref: 'refs/heads/dev'}, env) do |calls, _, status, _|
        assert_equal env.values.first.to_i, status.exitstatus
        assert_empty calls.grep(%r{^bash native-ios/scripts/verify-native-product.sh })
      end
    end
  end

  def test_full_jobs_and_additional_build_checks_require_explicit_dispatch_full
    %w[ci-native-build ci-native-test-shards].each do |id|
      assert_equal FULL_CONDITION, JOBS.fetch(id)['if']
      refute selected?(JOBS.fetch(id)['if'], 'push', 'full')
      refute selected?(JOBS.fetch(id)['if'], 'workflow_dispatch', 'light')
      assert selected?(JOBS.fetch(id)['if'], 'workflow_dispatch', 'full')
    end
    assert_equal %w[player player-options product remaining], JOBS.fetch('ci-native-test-shards').fetch('strategy').fetch('matrix').fetch('shard')
    steps = JOBS.fetch('ci-ios-build').fetch('steps')
    %w[test-service-build.sh test-native-runtime-inspection.sh].each do |script|
      matches = steps.select { |step| step.fetch('run', '').include?(script) }
      assert_equal 1, matches.length
      assert_equal FULL_CONDITION, matches.first.fetch('if')
    end
    release = steps.select { |step| step.fetch('run', '').include?('-configuration Release') }
    assert_equal 1, release.length
    assert_equal FULL_CONDITION, release.first.fetch('if')
    assert_equal 'always()', JOBS.fetch('ci-native-tests').fetch('if')
    assert_equal %w[ci-branch-policy ci-swift-tests ci-native-build ci-native-test-shards], JOBS.fetch('ci-native-tests').fetch('needs')
    assert_equal({
      'TEST_SCOPE' => '${{ needs.ci-branch-policy.outputs.test-scope }}',
      'PROFILE_RESULT' => '${{ needs.ci-branch-policy.result }}',
      'HOST_RESULT' => '${{ needs.ci-swift-tests.result }}',
      'BUILD_RESULT' => '${{ needs.ci-native-build.result }}',
      'SHARD_RESULT' => '${{ needs.ci-native-test-shards.result }}'
    }, JOBS.fetch('ci-native-tests').fetch('steps').first.fetch('env'))
    dispatch = WORKFLOW.fetch('on', WORKFLOW[true]).fetch('workflow_dispatch').fetch('inputs').fetch('test_scope')
    assert_equal %w[full light], dispatch.fetch('options')
    assert_equal 'full', dispatch.fetch('default')
    %w[ci-quality ci-native-tests ci-ios-build ci-branch-policy].each do |id|
      assert_equal id, JOBS.fetch(id).fetch('name')
    end
    assert_equal 'release-approval', JOBS.fetch('release-approval').fetch('environment')
    assert_equal "github.event_name == 'pull_request' && github.base_ref == 'main'", JOBS.fetch('release-approval').fetch('if')
  end

  def test_light_quality_keeps_tooling_regressions
    commands = JOBS.fetch('ci-quality').fetch('steps').map { |step| step.fetch('run', '') }.join("\n")
    %w[test-ci-light-workflow.rb test-ci-swift-package-tests.rb test-ci-test-shards.sh test-ci-test-products.sh test-ci-preflight.sh test-ci-build-progress.sh test-native-pre-push.rb test-offline-acceptance-runner.sh].each do |script|
      assert_includes commands, script
    end
  end
end
