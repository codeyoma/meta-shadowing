#!/usr/bin/env ruby
# Compare Xcode's compiled inventory with the finalized xcresult case identities.
require 'json'

def require_type(value, type)
  raise ArgumentError, 'Unexpected JSON type.' unless value.is_a?(type)
  value
end

def full_identifier(value)
  require_type(value, String)
  raise ArgumentError, 'Invalid inventory method identifier.' unless value.match?(%r{\A[A-Za-z_][A-Za-z0-9_.]*/[A-Za-z_][A-Za-z0-9_.]*/[A-Za-z_][A-Za-z0-9_]*\([A-Za-z0-9_:]*\)\z})
  value
end

def selector_matches?(identifier, selector)
  return true if identifier == selector || identifier.start_with?("#{selector}/")
  # xcodebuild method selectors commonly omit the function's parentheses.
  !selector.include?('(') && identifier.sub(/\([^()]*\)\z/, '') == selector
end

begin
  raise ArgumentError, 'Expected inventory, selection, summary and tests JSON files.' unless ARGV.length == 4
  inventory, selection, summary, tests = ARGV.map { |path| JSON.parse(File.read(path)) }
  require_type(inventory, Hash)
  raise ArgumentError, 'Enumeration reported errors.' unless require_type(inventory.fetch('errors'), Array).empty?
  originals = require_type(inventory.fetch('values'), Array).flat_map do |value|
    require_type(value, Hash)
    raise ArgumentError, 'Enumeration contains disabled tests.' unless require_type(value.fetch('disabledTests'), Array).empty?
    require_type(value.fetch('enabledTests'), Array).map do |test|
      full_identifier(require_type(test, Hash).fetch('identifier'))
    end
  end
  expected = originals.map { |identifier| identifier.split('/', 2).last }
  raise ArgumentError, 'Enumeration is empty or has ambiguous method identities.' if expected.empty? || expected.uniq.length != expected.length
  only = []
  skip = []
  require_type(selection, Array).each do |flag|
    require_type(flag, String)
    match = /\A-(only|skip)-testing:([A-Za-z_][A-Za-z0-9_.]*(?:\/[A-Za-z_][A-Za-z0-9_.]*){0,2}(?:\([A-Za-z0-9_:]*\))?)\z/.match(flag)
    raise ArgumentError, 'Invalid test selector.' unless match
    identifiers = originals.select { |identifier| selector_matches?(identifier, match[2]) }
    raise ArgumentError, 'Test selector matches no compiled methods.' if identifiers.empty?
    (match[1] == 'only' ? only : skip).concat(identifiers)
  end
  selected = (only.empty? ? originals : only.uniq) - skip
  raise ArgumentError, 'Test selection is empty.' if selected.empty?
  expected = selected.map { |identifier| identifier.split('/', 2).last }
  require_type(summary, Hash)
  raise ArgumentError, 'Native summary is not passed.' unless summary.fetch('result') == 'Passed'
  %w[totalTestCount passedTests failedTests skippedTests].each do |key|
    require_type(summary.fetch(key), Integer)
  end
  raise ArgumentError, 'Native summary contains failures or skips.' unless summary['failedTests'].zero? && summary['skippedTests'].zero?
  if summary.key?('expectedFailures')
    raise ArgumentError, 'Native summary contains expected failures.' unless require_type(summary['expectedFailures'], Integer).zero?
  end
  raise ArgumentError, 'Native summary counts are incomplete.' unless summary['totalTestCount'].positive? && summary['passedTests'] == summary['totalTestCount']
  if summary.key?('testFailures')
    raise ArgumentError, 'Native summary contains failure records.' unless require_type(summary['testFailures'], Array).empty?
  end
  require_type(tests, Hash)
  cases = []
  argument_runs = []
  visit = lambda do |node|
    require_type(node, Hash)
    require_type(node.fetch('nodeType'), String)
    if node.key?('result')
      raise ArgumentError, 'Native result tree contains a non-passed node.' unless node['result'] == 'Passed'
    end
    if node['nodeType'] == 'Test Case'
      require_type(node.fetch('nodeIdentifier'), String)
      full_identifier("Target/#{node['nodeIdentifier']}")
      raise ArgumentError, 'Native case has no passed result.' unless node.fetch('result') == 'Passed'
    elsif node['nodeType'] == 'Test Case Run'
      argument_runs << require_type(node.fetch('nodeIdentifier'), String)
      raise ArgumentError, 'Native argument run has no passed result.' unless node.fetch('result') == 'Passed'
    end
    cases << node if node['nodeType'] == 'Test Case'
    require_type(node.fetch('children', []), Array).each { |child| visit.call(child) }
  end
  require_type(tests.fetch('testNodes'), Array).each { |node| visit.call(node) }
  raise ArgumentError, 'Native result tree has duplicate argument runs.' unless argument_runs.uniq.length == argument_runs.length
  actual = cases.map { |node| node.fetch('nodeIdentifier') }
  raise ArgumentError, 'Native test identities do not match.' unless expected.sort == actual.sort
  raise ArgumentError, 'Native case counts do not match.' unless summary['totalTestCount'] == actual.length
  puts "PASS: #{actual.length} native test cases matched the selected inventory."
rescue ArgumentError, KeyError, TypeError, NoMethodError, SystemCallError, JSON::ParserError
  warn 'FAIL: native test results are invalid or incomplete.'
  exit 1
end
