#!/usr/bin/env ruby
# Validate the public result-checking CLI with independent literal fixtures.
require 'json'
require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require 'tmpdir'

class NativeTestResultsTest < Minitest::Test
  VALIDATOR = File.expand_path('validate-native-test-results.rb', __dir__)

  def setup
    @inventory = {
      'errors' => [],
      'values' => [{
        'testPlan' => 'MetaShadowingNative', 'disabledTests' => [],
        'enabledTests' => [
          { 'identifier' => 'NativeFoundationUITests/PlayerUITests/testAudio()' },
          { 'identifier' => 'NativeFoundationUITests/PlayerUITests/testRetry()' },
          { 'identifier' => 'NativeMediaIntegrationTests/TransportTests/plays(video:)' }
        ]
      }]
    }
    @selection = []
    @summary = { 'result' => 'Passed', 'totalTestCount' => 3, 'passedTests' => 3,
                 'failedTests' => 0, 'skippedTests' => 0, 'testFailures' => [] }
    @tests = { 'testNodes' => [
      { 'nodeType' => 'UI test bundle', 'name' => 'NativeFoundationUITests', 'children' => [
        { 'nodeType' => 'Test Case', 'nodeIdentifier' => 'PlayerUITests/testAudio()', 'result' => 'Passed' },
        { 'nodeType' => 'Test Case', 'nodeIdentifier' => 'PlayerUITests/testRetry()', 'result' => 'Passed' }
      ] },
      { 'nodeType' => 'Unit test bundle', 'name' => 'NativeMediaIntegrationTests', 'children' => [
        { 'nodeType' => 'Test Case', 'nodeIdentifier' => 'TransportTests/plays(video:)', 'result' => 'Passed',
          'children' => [
            { 'nodeType' => 'Test Case Run', 'nodeIdentifier' => 'TransportTests/plays(video:)/false', 'result' => 'Passed' },
            { 'nodeType' => 'Test Case Run', 'nodeIdentifier' => 'TransportTests/plays(video:)/true', 'result' => 'Passed' }
          ] }
      ] }
    ] }
  end

  def validate
    Dir.mktmpdir('native-results-test-') do |directory|
      paths = [@inventory, @selection, @summary, @tests].each_with_index.map do |value, index|
        path = File.join(directory, "input-#{index}.json")
        File.write(path, JSON.generate(value))
        path
      end
      Open3.capture3(RbConfig.ruby, VALIDATOR, *paths)
    end
  end

  # Dropping the full-inventory check or treating parenthesized function names as
  # selector suffixes would reject this valid parameterized inventory.
  def test_full_inventory_passes_with_exact_parameterized_function_identity
    output, error, status = validate
    assert status.success?, error
    assert_equal "PASS: 3 native test cases matched the selected inventory.\n", output
  end

  # Accepting enumeration errors, disabled methods or a target-only generic
  # inventory would allow an incomplete suite to look complete.
  def test_refuses_enumeration_errors_disabled_cases_and_non_method_entries
    [
      -> { @inventory['errors'] = ['PRIVATE enumeration error'] },
      -> { @inventory['values'][0]['disabledTests'] = [{ 'identifier' => 'Target/Suite/testDisabled()' }] },
      -> { @inventory['values'][0]['enabledTests'][0]['identifier'] = 'NativeFoundationUITests' }
    ].each do |change|
      setup
      change.call
      output, error, status = validate
      refute status.success?, 'Incomplete inventory must fail.'
      refute_includes output + error, 'PRIVATE'
    end
  end

  # A zero-test or multiply enumerated test plan must not produce a full pass.
  def test_refuses_empty_inventory_and_duplicate_or_ambiguous_names
    [
      -> { @inventory['values'][0]['enabledTests'] = []; @tests['testNodes'] = []; @summary.merge!('totalTestCount' => 0, 'passedTests' => 0) },
      -> { @inventory['values'][0]['enabledTests'] << { 'identifier' => 'NativeFoundationUITests/PlayerUITests/testAudio()' } },
      -> { @inventory['values'][0]['enabledTests'] << { 'identifier' => 'OtherTarget/PlayerUITests/testAudio()' } }
    ].each do |change|
      setup
      change.call
      _, _, status = validate
      refute status.success?, 'Empty or ambiguous inventory must fail.'
    end
  end

  # Ignoring inclusion/exclusion flags would either reject this shard or accept
  # execution of methods its requested selection excluded.
  def test_target_and_method_selectors_have_exact_inclusion_and_exclusion
    @selection = ['-only-testing:NativeFoundationUITests', '-skip-testing:NativeFoundationUITests/PlayerUITests/testRetry']
    @tests['testNodes'] = [@tests['testNodes'][0]]
    @tests['testNodes'][0]['children'].pop
    @summary.merge!('totalTestCount' => 1, 'passedTests' => 1)
    output, error, status = validate
    assert status.success?, error
    assert_equal "PASS: 1 native test cases matched the selected inventory.\n", output
  end

  # Removing parameter labels during identity comparison would conflate
  # overloads or unrelated argument cases.
  def test_parameterized_method_selector_preserves_its_full_function_name
    @selection = ['-only-testing:NativeMediaIntegrationTests/TransportTests/plays(video:)']
    @tests['testNodes'] = [@tests['testNodes'][1]]
    @summary.merge!('totalTestCount' => 1, 'passedTests' => 1)
    _, error, status = validate
    assert status.success?, error
  end

  # A misspelled skip flag must fail even when every real case happened to pass.
  def test_unknown_and_malformed_selectors_fail_closed
    [
      ['-skip-testing:NativeFoundationUITests/PlayerUITests/testTypo'],
      ['-only-testing:NativeFoundationUITests/PlayerUITestsExtra'],
      ['-only-testing:'], ['NativeFoundationUITests'], [12], {},
      ['-only-testing:NativeFoundationUITests', '-skip-testing:NativeFoundationUITests']
    ].each do |selection|
      @selection = selection
      _, _, status = validate
      refute status.success?, 'Invalid or empty selection must fail.'
    end
  end

  # Exit-zero reports with failures, skips, inconsistent counts, or the wrong
  # JSON scalar types must not authorize a push.
  def test_summary_requires_passed_integer_counts_and_no_failures_or_skips
    [
      { 'result' => 'Failed' }, { 'passedTests' => 2 }, { 'failedTests' => 1 },
      { 'skippedTests' => 1 }, { 'totalTestCount' => '3' }, { 'passedTests' => 3.0 },
      { 'testFailures' => [{ 'message' => 'PRIVATE failure details' }] }
    ].each do |changes|
      setup
      @summary.merge!(changes)
      output, error, status = validate
      refute status.success?, 'Invalid summary must fail.'
      refute_includes output + error, 'PRIVATE'
    end
  end

  # Checking only total counts would accept an extra case replacing a missing
  # one; checking only the parent result would hide a failed argument run.
  def test_actual_results_reject_missing_extra_duplicate_and_non_passed_cases
    [
      -> { @tests['testNodes'][0]['children'].pop },
      -> { @tests['testNodes'][0]['children'][0]['nodeIdentifier'] = 'PlayerUITests/testOther()' },
      -> { @tests['testNodes'][0]['children'][1] = @tests['testNodes'][0]['children'][0].dup },
      -> { @tests['testNodes'][0]['children'][0]['result'] = 'Skipped' },
      -> { @tests['testNodes'][1]['children'][0]['children'][0]['result'] = 'Failed' },
      -> { @tests['testNodes'][1]['children'][0]['children'][1] = @tests['testNodes'][1]['children'][0]['children'][0].dup },
      -> { @tests['testNodes'][1]['children'][0]['nodeIdentifier'] = 'TransportTests/plays()' }
    ].each do |change|
      setup
      change.call
      _, _, status = validate
      refute status.success?, 'Incomplete or non-passing actual cases must fail.'
    end
  end

  # A malformed tree must not be interpreted as an empty or successful report.
  def test_json_types_are_checked_at_every_input_boundary
    [
      -> { @inventory = [] }, -> { @inventory['errors'] = {} },
      -> { @inventory['values'] = {} }, -> { @inventory['values'][0]['disabledTests'] = false },
      -> { @inventory['values'][0]['enabledTests'] = {} },
      -> { @inventory['values'][0]['enabledTests'][0]['identifier'] = 9 },
      -> { @summary = [] }, -> { @tests = [] }, -> { @tests['testNodes'] = {} },
      -> { @tests['testNodes'][0]['children'] = {} },
      -> { @tests['testNodes'][0]['children'][0]['result'] = true }
    ].each do |change|
      setup
      change.call
      _, _, status = validate
      refute status.success?, 'Malformed JSON types must fail.'
    end
  end
end
