#!/usr/bin/env ruby
require 'open3'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'digest'

# Git replacements must not change object bytes associated with a pushed OID.
ENV['GIT_NO_REPLACE_OBJECTS'] = '1'
$stdout.sync = true
NATIVE_FULL_CONTRACT_VERSION = 5
NATIVE_SCOPE_CONTRACT_VERSION = 1
PROGRESS_LINES = [
  'Native full: generating project.',
  'Native full: building test products.',
  'Native full: inspecting Debug product.',
  'Native full: building Release product.',
  'Native full: inspecting Release product.',
  'Native full: building fictional downloader.',
  'Native full: checking runtime inspection guard.',
  'Native full: preparing simulator.',
  'Native full: enumerating tests.',
  'Native full: running all native tests.',
  'Native full: running native integrations.',
  'Native full: running two UI selections.',
  'Native full: validating combined results.',
  'Native full: validating results.',
  'Native full: running selected native tests.', 'Native full: running scoped package tests.'
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

def configured_simulator(name, optional: false)
  output, status = Open3.capture2e('git', 'config', '--local', '--null', '--get-all', name)
  return nil if optional && status.exitstatus == 1
  unless status.success?
    fail_push("configure repository-local #{name} before pushing.")
  end
  values = output.split("\0", -1)
  terminator = values.pop
  unless terminator == '' && values.length == 1 &&
         values.first.match?(/\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z/)
    fail_push("configure exactly one UUID for repository-local #{name}.")
  end
  values.first.upcase
end

def active_lease?(results)
  return false unless results
  Dir.children(results).any? do |entry|
    next false unless entry.start_with?('native-lease-')
    begin
      File.lstat(File.join(results, entry, 'active'))
      true
    rescue Errno::ENOENT
      false
    end
  end
rescue StandardError
  # Unreadable ownership evidence cannot prove separately owned groups settled.
  true
end

# Cancellation must drain the owned process group before another test run starts.
def stop_runner(pid)
  # The full-runner supervisor may need 30 seconds to drain its simulator leases.
  [['TERM', 40], ['KILL', 2]].each do |signal, grace|
    begin
      Process.kill(signal, -pid)
    rescue Errno::ESRCH
      nil
    end
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + grace
    loop do
      begin
        result = Process.waitpid2(pid, Process::WNOHANG)
        yield result.last if result && block_given?
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
results = nil
cleanup_snapshot = true
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
  simulator = configured_simulator('native.prePushSimulator')
  secondary_simulator = configured_simulator('native.prePushSecondarySimulator', optional: true)
  if simulator == secondary_simulator
    fail_push('primary and secondary simulator IDs must be distinct.')
  end
  toolchain = [capture!('xcodebuild', '-version').strip, capture!('xcodegen', '--version').strip]
  fail_push('the required toolchain returned no version.') if toolchain.any?(&:empty?)
  devices = JSON.parse(capture!('xcrun', 'simctl', 'list', 'devices', 'available', '--json')).fetch('devices')
  runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0'
  available = devices.flat_map { |identifier, entries| entries.map { |device| [identifier, device] } }
  selected_devices = [simulator, secondary_simulator].compact.map do |id|
    matches = available.select { |_identifier, device| device['udid'].to_s.upcase == id }
    identifier, device = matches.first
    unless matches.length == 1 && identifier == runtime && device['isAvailable'] == true &&
           device['name'].to_s.start_with?('MetaShadowing Native Pre-push') && !device['name'].to_s.match?(/\bW2\b/i)
      fail_push('configure a dedicated MetaShadowing Native Pre-push iOS 27.0 simulator for each selected device.')
    end
    device
  end
  if secondary_simulator
    device_types = selected_devices.map { |device| device['deviceTypeIdentifier'] }
    unless device_types.all? { |type| type.is_a?(String) && !type.empty? } && device_types.uniq.length == 1
      fail_push('primary and secondary simulators must have the same device type.')
    end
  end
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
    configured_base, base_status = Open3.capture2e('git', 'config', '--local', '--null', '--get-all', 'native.prePushBaseRef')
    bases = base_status.exitstatus == 1 ? ['refs/remotes/origin/dev'] : configured_base.split("\0")
    fail_push('configure one native.prePushBaseRef branch reference.') unless (base_status.success? || base_status.exitstatus == 1) &&
      bases.length == 1 && bases.first.match?(%r{\Arefs/(?:heads|remotes)/[^\s]+\z})
    base_tip = capture!('git', 'rev-parse', '--verify', "#{bases.first}^{commit}").strip
    merge_bases = capture!('git', 'merge-base', '--all', base_tip, oid).lines.map(&:strip)
    fail_push('PR base must resolve to one merge base; refresh the configured base reference.') unless merge_bases.length == 1
    base = merge_bases.first
    private_config = capture!('git', 'ls-tree', '--name-only', oid, '--', 'native-ios/Config/Local.xcconfig').strip
    fail_push('pushed commit contains private local configuration; push blocked.') unless private_config.empty?
    runner = capture!('git', 'ls-tree', oid, '--', 'native-ios/scripts/test-native-full.sh')
    unless runner.match?(/\A100(?:644|755) blob [0-9a-f]+\tnative-ios\/scripts\/test-native-full\.sh\n\z/)
      fail_push('pushed commit lacks a regular committed full-test runner.')
    end
    committed_runner = capture!('git', 'show', "#{oid}:native-ios/scripts/test-native-full.sh")
    markers = committed_runner.lines.grep(/\A# NATIVE_FULL_CONTRACT_VERSION=/).map(&:chomp)
    unless markers == ["# NATIVE_FULL_CONTRACT_VERSION=#{NATIVE_FULL_CONTRACT_VERSION}"]
      fail_push('pushed commit lacks the required full-test contract; push blocked.')
    end
    scope_markers = committed_runner.lines.grep(/\A# NATIVE_SCOPE_CONTRACT_VERSION=/).map(&:chomp)
    fail_push('pushed commit lacks the required scoped-test contract; push blocked.') unless scope_markers == ["# NATIVE_SCOPE_CONTRACT_VERSION=#{NATIVE_SCOPE_CONTRACT_VERSION}"]
    identity = { 'contract_version' => NATIVE_FULL_CONTRACT_VERSION, 'commit' => oid, 'toolchain' => toolchain,
                 'simulator' => simulator, 'secondary_simulator' => secondary_simulator,
                 'mode' => secondary_simulator ? 'two-simulator' : 'serial', 'runtime' => runtime,
                 'scope_contract_version' => NATIVE_SCOPE_CONTRACT_VERSION, 'base' => base }
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
    File.write(File.join(lock, 'owner'), "pid=#{Process.pid}\nsnapshot=#{snapshot}\nevidence=#{run}\n", mode: 'w', perm: 0o600)
    archive = File.join(run, 'snapshot.tar')
    capture!('git', 'archive', '--format=tar', "--output=#{archive}", oid, 'native-ios', 'assets')
    capture!('tar', '-xf', archive, '-C', snapshot)
    paths = capture!('git', 'diff', '--no-renames', '--name-only', '-z', base, oid, '--', 'native-ios', 'assets').split("\0").sort
    hunks = paths.grep(%r{\Anative-ios/Tests/AppUITests/.*\.swift\z}).to_h do |path|
      patch = capture!('git', 'diff', '--no-ext-diff', '--no-textconv', '--unified=0', base, oid, '--', path)
      [path, patch.scan(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/).map { |line, count| [line.to_i, count.to_s.empty? ? 1 : count.to_i] }]
    end
    changes = File.join(results, 'changes.json')
    scope_path = File.join(results, 'scope.json')
    File.write(changes, JSON.generate('base' => base, 'head' => oid, 'paths' => paths, 'hunks' => hunks), mode: 'w', perm: 0o600)
    _scope_output, scope_status = Open3.capture2e('ruby', File.join(snapshot, 'native-ios/scripts/native-test-scope.rb'), 'plan', changes, scope_path, chdir: snapshot)
    fail_push('changed native source has no valid test scope; review the ownership mapping.') unless scope_status.success?
    scope = JSON.parse(File.read(scope_path))
    puts "Native pre-push: scoped screens #{scope.fetch('screens').join(', ').then { |names| names.empty? ? '(none; logic/build checks only)' : names }}."
    puts "Native pre-push: audit screens #{scope.fetch('audit_screens').join(', ')}." unless scope.fetch('audit_screens').empty?
    verdict = nil
    success = File.open(File.join(run, 'runner.log'), 'w', 0o600) do |log|
      reader, writer = IO.pipe
      begin
        child_environment = ENV.keys.grep(/\AGIT_/).to_h { |name| [name, nil] }
        child_environment['TMPDIR'] = File.join(snapshot, '.tmp')
        child_environment['NATIVE_TEST_SCOPE_FILE'] = scope_path
        FileUtils.mkdir_p(child_environment.fetch('TMPDIR'), mode: 0o700)
        arguments = ['bash', 'native-ios/scripts/test-native-full.sh', '--simulator-id', simulator, '--output-dir', results]
        arguments.concat(['--secondary-simulator-id', secondary_simulator]) if secondary_simulator
        runner_pid = Process.spawn(child_environment, *arguments, chdir: snapshot, out: writer, err: writer, pgroup: true)
        writer.close
        reader.each_line do |line|
          log.write(line)
          public_line = line.chomp
          if PROGRESS_LINES.include?(public_line)
            puts public_line
          elsif public_line.match?(/\APASS: \d+ native test cases matched the selected inventory\.\z/)
            verdict = public_line
          end
        end
        _pid, status = Process.wait2(runner_pid)
        runner_pid = nil
        status.success?
      ensure
        if runner_pid
          %w[INT TERM].each { |signal| Signal.trap(signal, 'IGNORE') }
          # Cancellation interrupted the foreground reader. Keep draining this
          # pipe until the supervisor has finished its host/guest cleanup.
          drainage = Thread.new do
            loop { log.write(reader.readpartial(4096)) }
          rescue EOFError, IOError
            nil
          end
          settled = stop_runner(runner_pid) do |status|
            log.puts JSON.generate('supervisor_exit' => status.exitstatus, 'signal' => status.termsig)
          end
          drainage.join(1)
          drainage.kill if drainage.alive?
          unless settled
            owned_lock = nil
            cleanup_snapshot = false
            warn 'Native pre-push: cancellation could not drain native processes; repository lock retained for inspection.'
          end
          runner_pid = nil
        end
        reader.close unless reader.closed?
        writer.close unless writer.closed?
      end
    end
    fail_push('native lease remains active; push blocked.') if active_lease?(results)
    FileUtils.remove_entry(snapshot)
    snapshot = nil
    File.delete(archive)
    fail_push('scoped tests or build checks failed; push blocked. Evidence is in the Git common directory under native-pre-push.') unless success
    temporary_pass = File.join(run, 'pass.json')
    File.write(temporary_pass, JSON.generate(identity), mode: 'w', perm: 0o600)
    File.rename(temporary_pass, cache)
    puts verdict if verdict
    puts 'Native pre-push: scoped checks passed; evidence retained under Git common directory/native-pre-push. This is not full-regression evidence.'
  end
rescue StandardError
  fail_push('required tools or local evidence are unavailable; push blocked.')
ensure
  if runner_pid
    %w[INT TERM].each { |signal| Signal.trap(signal, 'IGNORE') }
    unless stop_runner(runner_pid)
      owned_lock = nil
      cleanup_snapshot = false
      warn 'Native pre-push: cancellation could not drain native processes; repository lock retained for inspection.'
    end
  end
  if active_lease?(results)
    owned_lock = nil
    cleanup_snapshot = false
    warn 'Native pre-push: active native lease; snapshot and repository lock retained for inspection.'
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
