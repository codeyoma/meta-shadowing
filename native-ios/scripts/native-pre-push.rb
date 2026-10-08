#!/usr/bin/env ruby
require 'open3'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'digest'

# Git replacements must not change object bytes associated with a pushed OID.
ENV['GIT_NO_REPLACE_OBJECTS'] = '1'
$stdout.sync = true
PROGRESS_LINES = [
  'Native full: generating project.',
  'Native full: building test products.',
  'Native full: preparing simulator.',
  'Native full: enumerating tests.',
  'Native full: running all native tests.',
  'Native full: validating results.'
].freeze

def fail_push(message)
  warn "Native pre-push: #{message}"
  exit 1
end

def capture!(*arguments)
  output, status = Open3.capture2e(*arguments)
  fail_push('a required Git or toolchain command failed.') unless status.success?
  output
end

# Cancellation must drain the owned process group before another test run starts.
def stop_runner(pid)
  %w[TERM KILL].each do |signal|
    begin
      Process.kill(signal, -pid)
    rescue Errno::ESRCH
      nil
    end
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 2
    loop do
      begin
        Process.waitpid(pid, Process::WNOHANG)
      rescue Errno::ECHILD
        nil
      end
      begin
        Process.kill(0, -pid)
      rescue Errno::ESRCH
        return true
      end
      break if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.02
    end
  end
  false
end

owned_lock = nil
runner_pid = nil
snapshot = nil
begin
  root = capture!('git', 'rev-parse', '--show-toplevel').strip
  Dir.chdir(root)
  commits = STDIN.each_line.map do |line|
    fields = line.split
    fail_push('malformed pre-push input; push blocked.') unless fields.length == 4
    _local_ref, oid, remote_ref, remote_oid = fields
    valid_oid = /\A(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})\z/
    unless oid.match?(valid_oid) && remote_oid.match?(valid_oid) && remote_ref.start_with?('refs/')
      fail_push('malformed pre-push input; push blocked.')
    end
    capture!('git', 'check-ref-format', remote_ref)
    next if oid.match?(/\A0+\z/)
    capture!('git', 'rev-parse', '--verify', "#{oid}^{commit}").strip
  end.compact.uniq
  exit 0 if commits.empty?
  simulator, configured = Open3.capture2e('git', 'config', '--local', '--get', 'native.prePushSimulator')
  simulator = simulator.strip
  fail_push('configure repository-local native.prePushSimulator before pushing.') unless configured.success? && !simulator.empty?
  toolchain = [capture!('xcodebuild', '-version').strip, capture!('xcodegen', '--version').strip]
  fail_push('the required toolchain returned no version.') if toolchain.any?(&:empty?)
  devices = JSON.parse(capture!('xcrun', 'simctl', 'list', 'devices', 'available', '--json')).fetch('devices')
  runtime = devices.find do |identifier, entries|
    identifier == 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' &&
      entries.any? do |device|
        device['udid'] == simulator && device['isAvailable'] == true &&
          device['name'].to_s.start_with?('MetaShadowing Native Pre-push')
      end
  end&.first
  fail_push('configure a dedicated MetaShadowing Native Pre-push iOS 27.0 simulator.') unless runtime
  common = capture!('git', 'rev-parse', '--path-format=absolute', '--git-common-dir').strip
  evidence = File.join(common, 'native-pre-push')
  FileUtils.mkdir_p(evidence, mode: 0o700)
  lock = File.join(evidence, 'lock')
  begin
    Dir.mkdir(lock, 0o700)
    owned_lock = lock
  rescue Errno::EEXIST
    fail_push('repository test lock exists; wait for validation or inspect the stale lock under Git common directory/native-pre-push/lock.')
  end
  File.write(File.join(lock, 'owner'), "pid=#{Process.pid}\n", mode: 'w', perm: 0o600)
  %w[INT TERM].each { |signal| Signal.trap(signal) { exit 1 } }
  commits.each do |oid|
    private_config = capture!('git', 'ls-tree', '--name-only', oid, '--', 'native-ios/Config/Local.xcconfig').strip
    fail_push('pushed commit contains private local configuration; push blocked.') unless private_config.empty?
    runner = capture!('git', 'ls-tree', oid, '--', 'native-ios/scripts/test-native-full.sh')
    unless runner.match?(/\A100(?:644|755) blob [0-9a-f]+\tnative-ios\/scripts\/test-native-full\.sh\n\z/)
      fail_push('pushed commit lacks a regular committed full-test runner.')
    end
    identity = { 'contract_version' => 3, 'commit' => oid, 'toolchain' => toolchain,
                 'simulator' => simulator, 'runtime' => runtime }
    key = Digest::SHA256.hexdigest(JSON.generate(identity))
    cache = File.join(evidence, "pass-#{key}.json")
    if File.file?(cache) && JSON.parse(File.read(cache)) == identity
      puts 'Native pre-push: exact pushed commit already passed with this toolchain and simulator.'
      next
    end
    run = Dir.mktmpdir('run-', evidence)
    snapshot = File.realpath(Dir.mktmpdir('native-pre-push-snapshot-', '/tmp'))
    results = File.join(run, 'results')
    FileUtils.mkdir_p(results)
    archive = File.join(run, 'snapshot.tar')
    capture!('git', 'archive', '--format=tar', "--output=#{archive}", oid, 'native-ios', 'assets')
    capture!('tar', '-xf', archive, '-C', snapshot)
    puts 'Native pre-push: running full tests for a pushed commit.'
    success = File.open(File.join(run, 'runner.log'), 'w', 0o600) do |log|
      reader, writer = IO.pipe
      begin
        child_environment = ENV.keys.grep(/\AGIT_/).to_h { |name| [name, nil] }
        child_environment['TMPDIR'] = File.join(snapshot, '.tmp')
        FileUtils.mkdir_p(child_environment.fetch('TMPDIR'), mode: 0o700)
        runner_pid = Process.spawn(child_environment, 'bash', 'native-ios/scripts/test-native-full.sh', '--simulator-id', simulator,
                                   '--output-dir', results, chdir: snapshot, out: writer, err: writer, pgroup: true)
        writer.close
        reader.each_line do |line|
          log.write(line)
          public_line = line.chomp
          if PROGRESS_LINES.include?(public_line) || public_line.match?(/\APASS: \d+ native test cases matched the selected inventory\.\z/)
            puts public_line
          end
        end
        _pid, status = Process.wait2(runner_pid)
        runner_pid = nil
        status.success?
      ensure
        reader.close unless reader.closed?
        writer.close unless writer.closed?
      end
    end
    FileUtils.remove_entry(snapshot)
    snapshot = nil
    File.delete(archive)
    fail_push('full tests failed; push blocked. Evidence is in the Git common directory under native-pre-push.') unless success
    temporary_pass = File.join(run, 'pass.json')
    File.write(temporary_pass, JSON.generate(identity), mode: 'w', perm: 0o600)
    File.rename(temporary_pass, cache)
    puts 'Native pre-push: full tests passed; evidence retained under Git common directory/native-pre-push.'
  end
rescue StandardError
  fail_push('required tools or local evidence are unavailable; push blocked.')
ensure
  cleanup_snapshot = true
  if runner_pid
    %w[INT TERM].each { |signal| Signal.trap(signal, 'IGNORE') }
    unless stop_runner(runner_pid)
      owned_lock = nil
      cleanup_snapshot = false
      warn 'Native pre-push: cancellation could not drain native processes; repository lock retained for inspection.'
    end
  end
  if snapshot && cleanup_snapshot && File.directory?(snapshot)
    begin
      FileUtils.remove_entry(snapshot)
    rescue StandardError
      owned_lock = nil
      warn 'Native pre-push: snapshot cleanup failed; repository lock retained for inspection.'
    end
  end
  FileUtils.remove_entry(owned_lock) if owned_lock && File.directory?(owned_lock)
end
