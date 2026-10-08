#!/usr/bin/env ruby
# Exercise the real gate, replacing only the Swift command boundary.
require 'fileutils'
require 'json'
require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require 'tmpdir'

class CISwiftPackageTestsTest < Minitest::Test
  PACKAGES = %w[LearningDomain LearningPersistence AppFoundation LearningMedia LearningReference AppleServices].freeze
  COUNTS = [53, 39, 81, 69, 19, 114].freeze

  def setup
    @root = Dir.mktmpdir('swift-package-gate-test-')
    @bin = File.join(@root, 'bin')
    @temporary = File.join(@root, 'temporary')
    FileUtils.mkdir_p([@bin, @temporary])
    @commands = File.join(@root, 'commands.jsonl')
    fixture = File.join(@bin, 'swift')
    File.write(fixture, <<~'RUBY')
      #!/usr/bin/env ruby
      require 'json'
      packages = %w[LearningDomain LearningPersistence AppFoundation LearningMedia LearningReference AppleServices]
      counts = JSON.parse(ENV.fetch('SWIFT_GATE_COUNTS', '[53,39,81,69,19,114]'))
      File.open(ENV.fetch('SWIFT_GATE_COMMANDS'), 'a') { |file| file.puts(JSON.generate(ARGV)) }
      package = File.basename(ARGV.fetch(2, ''))
      index = packages.index(package)
      abort 'Unexpected Swift command' unless index && ARGV == ['test', '--package-path', "native-ios/Packages/#{package}"]
      puts "Build complete! (0.10s)"
      puts "Test Suite 'All tests' passed at fixture time."
      puts "Executed 0 tests, with 0 failures (0 unexpected) in 0.000 (0.003) seconds"
      puts "◇ Test run started."
      puts '◇ Suite "Skipped recovery" started.'
      puts '✔ Test failedSaveRetainsRetry() passed after 0.001 seconds.'
      mode = package == ENV.fetch('SWIFT_GATE_BAD_PACKAGE', 'AppFoundation') ? ENV['SWIFT_GATE_MODE'] : nil
      diagnostics = {
        'failed-test' => '✘ Test PRIVATE_payload() failed after 0.123 seconds with 1 issue.',
        'failed-suite' => '✘ Suite "PRIVATE payload" failed after 0.123 seconds with 1 issue.',
        'skipped-test' => '↷ Test PRIVATE_payload() skipped.',
        'skipped-suite' => '↷ Suite "PRIVATE payload" skipped.',
        'plain-failed-test' => 'Test PRIVATE_payload() failed after 0.123 seconds.',
        'plain-skipped-suite' => 'Suite "PRIVATE payload" skipped.',
        'xctest-failed-suite' => "Test Suite 'PRIVATE payload' failed at fixture time."
      }
      puts diagnostics[mode] if diagnostics.key?(mode)
      STDOUT.write("\xffPRIVATE parser payload\n") if mode == 'invalid-encoding'
      count = mode == 'zero' ? 0 : counts[index]
      summary = "✔ Test run with #{count} tests in #{index + 1} suites passed after 0.123 seconds."
      summary = '✔ Test run with 1 test in 1 suite passed after 0.123 seconds.' if mode == 'singular'
      summary = '✔ Test run with 1 test passed after 0.123 seconds.' if mode == 'without-suites'
      summary = '✘ Test run with 81 tests in 3 suites failed after 0.123 seconds with 1 issue.' if mode == 'failed-summary'
      summary = '✔ Test run with 81 tests in 3 suites passed after unknown seconds.' if mode == 'malformed-summary'
      puts summary unless mode == 'missing'
      puts summary if mode == 'multiple'
      if mode == 'nonzero'
        warn "PRIVATE command failure at #{ENV.fetch('SWIFT_GATE_COMMANDS')}"
        exit 17
      end
    RUBY
    File.chmod(0o755, fixture)
    { 'ruby' => RbConfig.ruby, 'mktemp' => '/usr/bin/mktemp', 'rm' => '/bin/rm' }.each do |name, executable|
      File.symlink(executable, File.join(@bin, name))
    end
    @environment = { 'PATH' => @bin, 'TMPDIR' => @temporary, 'SWIFT_GATE_COMMANDS' => @commands }
  end

  def teardown
    FileUtils.remove_entry(@root)
  end

  def run_gate(*arguments)
    Open3.capture3(@environment, '/bin/bash', 'native-ios/scripts/ci-swift-package-tests.sh', *arguments,
                   chdir: File.expand_path('../..', __dir__))
  end

  def commands
    File.exist?(@commands) ? File.readlines(@commands).map { |line| JSON.parse(line) } : []
  end

  def test_all_six_unfiltered_packages_run_and_report_the_actual_total
    output, error, status = run_gate
    assert status.success?, error
    assert_equal PACKAGES.map { |package| ['test', '--package-path', "native-ios/Packages/#{package}"] }, commands
    PACKAGES.zip(COUNTS).each do |package, count|
      assert_includes output, "#{package}: #{count} tests passed after 0.123 seconds."
    end
    assert_includes output, 'PASS: 375 Swift package tests passed across 6 packages.'
    assert_empty Dir.children(@temporary), 'Successful private raw logs should be removed.'
    refute_includes output + error, @root
  end

  def test_zero_test_passed_summary_does_not_approve_a_package
    @environment['SWIFT_GATE_MODE'] = 'zero'
    output, error, status = run_gate
    refute status.success?, 'A positive test count is required for every package.'
    refute_includes output, 'PASS:'
    assert_includes error, 'AppFoundation'
    refute_includes output + error, @root
    assert_equal 1, Dir.children(@temporary).length, 'Failure diagnostics should remain private and available.'
  end

  def test_missing_or_multiple_final_summaries_do_not_approve_a_package
    %w[missing multiple].each do |mode|
      @environment['SWIFT_GATE_MODE'] = mode
      output, error, status = run_gate
      refute status.success?, "#{mode} final summaries must fail."
      refute_includes output, 'PASS:'
      assert_includes error, 'AppFoundation'
      refute_includes output + error, @root
    end
  end

  def test_failed_or_skipped_tests_and_suites_fail_even_with_exit_zero_and_a_passed_summary
    %w[failed-test failed-suite skipped-test skipped-suite plain-failed-test plain-skipped-suite xctest-failed-suite].each do |mode|
      @environment['SWIFT_GATE_MODE'] = mode
      output, error, status = run_gate
      refute status.success?, "#{mode} output must fail."
      refute_includes output, 'PASS:'
      assert_includes error, 'AppFoundation'
      refute_includes output + error, 'PRIVATE'
      refute_includes output + error, @root
    end
  end

  def test_process_failure_is_nonzero_and_reports_only_safe_private_diagnostic_location
    @environment['SWIFT_GATE_MODE'] = 'nonzero'
    output, error, status = run_gate
    refute status.success?
    refute_includes output, 'PASS:'
    assert_includes error, 'AppFoundation'
    assert_includes error, 'exit 17'
    assert_match(/Private diagnostics retained in temporary directory native-swift-package-tests\.[A-Za-z0-9]+ \(AppFoundation\.log\); inspect locally\./, error)
    refute_includes output + error, 'PRIVATE'
    refute_includes output + error, @root
    directory = File.join(@temporary, Dir.children(@temporary).fetch(0))
    assert_equal 0o700, File.stat(directory).mode & 0o777
    assert_equal 0o600, File.stat(File.join(directory, 'AppFoundation.log')).mode & 0o777
  end

  def test_unexpected_arguments_are_rejected_before_any_package_runs
    output, error, status = run_gate('--filter', 'PRIVATE_argument')
    refute status.success?
    assert_empty commands
    assert_empty Dir.children(@temporary)
    assert_includes error, 'expected no arguments'
    refute_includes output + error, 'PRIVATE_argument'
    refute_includes output + error, @root
  end

  def test_actual_total_can_change_without_a_frozen_test_inventory
    @environment['SWIFT_GATE_COUNTS'] = '[54,40,82,70,20,115]'
    output, error, status = run_gate
    assert status.success?, error
    assert_includes output, 'PASS: 381 Swift package tests passed across 6 packages.'
  end

  def test_singular_counts_and_top_level_tests_have_valid_final_summaries
    %w[singular without-suites].each do |mode|
      @environment['SWIFT_GATE_MODE'] = mode
      output, error, status = run_gate
      assert status.success?, "#{mode}: #{error}"
      assert_includes output, 'PASS: 295 Swift package tests passed across 6 packages.'
    end
  end

  def test_failed_and_malformed_final_summaries_cannot_approve_a_package
    %w[failed-summary malformed-summary].each do |mode|
      @environment['SWIFT_GATE_MODE'] = mode
      output, error, status = run_gate
      refute status.success?, "#{mode} must fail."
      refute_includes output, 'PASS:'
      assert_includes error, 'AppFoundation'
    end
  end

  def test_malformed_private_output_cannot_expose_parser_diagnostics
    @environment['SWIFT_GATE_MODE'] = 'invalid-encoding'
    output, error, status = run_gate
    refute status.success?
    assert_includes error, 'AppFoundation did not pass result validation'
    refute_includes output, 'PASS:'
    refute_includes output + error, 'PRIVATE'
    refute_includes output + error, @root
    refute_includes error, '-:'
  end
end
