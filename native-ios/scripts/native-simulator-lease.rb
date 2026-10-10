#!/usr/bin/env ruby
# Own destinations across clones and keep the final verdict behind host/guest drainage.
require 'json'
require 'tmpdir'
require 'fileutils'

class NativeSimulatorLease
  RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0'
  TOOLS = %w[xcodebuild xcodegen xcrun jq ruby bash swift rg file otool nm codesign plutil strings cmp ditto grep sed mkdir rm mktemp dirname].freeze

  def initialize(arguments)
    @arguments = arguments
    options = {}
    raise 'Invalid full runner arguments' unless [4, 6].include?(arguments.length)
    arguments.each_slice(2) do |key, value|
      raise 'Invalid full runner arguments' unless %w[--simulator-id --output-dir --secondary-simulator-id].include?(key) && !options.key?(key)
      options[key] = value
    end
    @output = options.fetch('--output-dir')
    raise 'An absolute existing output directory is required' unless @output.start_with?('/') && File.directory?(@output)
    @ids = [options.fetch('--simulator-id'), options['--secondary-simulator-id']].compact
    raise 'Distinct explicit simulator UUIDs are required' unless @ids.uniq.length == @ids.length && @ids.all? { |id| id.match?(/\A[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\z/) }
    @ids.map!(&:upcase)
    raise 'Distinct explicit simulator UUIDs are required' unless @ids.uniq.length == @ids.length
    @arguments = arguments.each_slice(2).flat_map { |key, value| [key, key.end_with?('simulator-id') ? value.upcase : value] }
    TOOLS.each do |tool|
      raise "Required tool unavailable: #{tool}" unless ENV.fetch('PATH', '').split(File::PATH_SEPARATOR).any? { |dir| File.executable?(File.join(dir, tool)) && !File.directory?(File.join(dir, tool)) }
    end
    raise 'Full verification requires an isolated archive snapshot' if File.exist?('.git') || File.symlink?('.git')
    raise 'Private local configuration must not enter the snapshot' if File.exist?('native-ios/Config/Local.xcconfig') || File.symlink?('native-ios/Config/Local.xcconfig')
    @owned = []
    @pid = nil
    @interrupted = false
    @verdict = nil
    @directory = Dir.mktmpdir('native-lease-', @output)
    # The outer hook cannot inspect independently owned process groups itself.
    # Keep the snapshot/repository lease until this supervisor proves settlement.
    @active_marker = File.join(@directory, 'active')
    File.write(@active_marker, '', mode: 'w', perm: 0o600)
    @usage = File.join(@directory, 'simulators-used')
    @command_index = 0
  end

  def clock
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def group_alive?(pid)
    Process.kill(0, -pid)
    true
  rescue Errno::ESRCH
    false
  end

  def drain(pid, deadline = clock + 4)
    return true unless pid
    %w[TERM KILL].each do |signal|
      begin
        Process.kill(signal, -pid)
      rescue Errno::ESRCH
        nil
      end
      phase_deadline = [clock + 2, deadline].min
      loop do
        begin
          Process.waitpid(pid, Process::WNOHANG)
        rescue Errno::ECHILD
          nil
        end
        return true unless group_alive?(pid)
        break if clock >= phase_deadline
        sleep 0.02
      end
    end
    false
  end

  # Control commands are bounded, and their private output never reaches Git.
  def control(*arguments)
    return nil if @control_unsettled
    deadline = @cleanup_deadline ? [clock + 8, @cleanup_deadline - 4].min : clock + 8
    return nil if deadline <= clock
    @command_index += 1
    path = File.join(@directory, "control-#{@command_index}.log")
    output = nil
    pid = nil
    begin
      pid = Process.spawn('xcrun', *arguments, out: path, err: File.join(@directory, "control-#{@command_index}.err"), pgroup: true)
      loop do
        result = Process.waitpid2(pid, Process::WNOHANG)
        if result
          output = File.read(path) if result.last.success?
          break
        end
        break if clock >= deadline
        sleep 0.02
      end
    ensure
      if pid && group_alive?(pid)
        @control_unsettled = true unless drain(pid, @cleanup_deadline || clock + 4)
      end
    end
    @control_unsettled ? nil : output
  end

  def selected_devices
    raw = control('simctl', 'list', 'devices', 'available', '--json')
    raise 'Simulator inventory failed' unless raw
    devices = JSON.parse(raw).fetch('devices').fetch(RUNTIME, [])
    selected = @ids.map do |id|
      matches = devices.select { |device| device['udid'].to_s.upcase == id }
      raise 'The explicit simulator could not be resolved' unless matches.length == 1
      device = matches.first
      unless device['isAvailable'] == true && device['name'].is_a?(String) &&
             device['name'].start_with?('MetaShadowing Native Pre-push') && !device['name'].match?(/\bW2\b/i)
        raise 'The explicit simulator could not be resolved'
      end
      device
    end
    if @ids.length == 2
      types = selected.map { |device| device['deviceTypeIdentifier'] }
      raise 'The two simulators must use the same device type' unless types.first.is_a?(String) && !types.first.empty? && types.uniq.length == 1
    end
    selected
  end

  def acquire
    root = File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}")
    Dir.mkdir(root, 0o700) unless File.exist?(root)
    stat = File.lstat(root)
    raise 'Unsafe simulator lock directory' unless stat.directory? && stat.uid == Process.uid && stat.mode & 0o077 == 0
    @ids.sort.each do |id|
      path = File.join(root, id)
      begin
        Dir.mkdir(path, 0o700)
      rescue Errno::EEXIST
        raise 'Simulator ownership lock exists; wait for the owner or inspect its retained private evidence'
      end
      @owned << path
      File.write(File.join(path, 'owner.json'), JSON.generate(pid: Process.pid, evidence: @directory), mode: 'w', perm: 0o600)
    end
  end

  def settle_guests
    return true unless File.file?(@usage)
    devices = selected_devices
    devices.each do |device|
      control('simctl', 'shutdown', device.fetch('udid')) unless device['state'] == 'Shutdown'
    end
    selected_devices.all? { |device| device['state'] == 'Shutdown' }
  rescue StandardError
    false
  end

  def publish_lines(reader, buffer)
    buffer << reader.read.to_s
    while (index = buffer.index("\n"))
      line = buffer.slice!(0..index).chomp
      if line.match?(/\APASS: \d+ native test cases matched the selected inventory\.\z/)
        @verdict = line
      elsif line.start_with?('FAIL:')
        warn line
      elsif line.start_with?('Native full:')
        puts line
      end
    end
  end

  def run
    code = 1
    %w[INT TERM].each { |signal| Signal.trap(signal) { @interrupted = true } }
    begin
      devices = selected_devices
      raise 'The explicit simulator could not be resolved' unless devices.all? { |device| %w[Booted Shutdown].include?(device['state']) }
      raise 'Native run cancelled' if @interrupted
      acquire
      log = File.join(@directory, 'runner.log')
      File.write(log, '')
      @pid = Process.spawn({ 'NATIVE_FULL_LEASE_STATE' => @usage }, 'bash', File.join(__dir__, 'native-full-body.sh'), *@arguments,
                           out: log, err: [:child, :out], pgroup: true)
      File.open(log) do |reader|
        buffer = +''
        loop do
          publish_lines(reader, buffer)
          break if @interrupted
          result = Process.waitpid2(@pid, Process::WNOHANG)
          if result
            code = result.last.exitstatus || 1
            publish_lines(reader, buffer)
            break
          end
          sleep 0.1
        end
      end
    ensure
      # One budget includes every host/control-group drain and guest operation.
      # The pre-push parent gives this supervisor 40 seconds before forced KILL.
      @cleanup_deadline = clock + 30
      host_settled = drain(@pid, [clock + 4, @cleanup_deadline].min)
      guests_settled = @owned.length == @ids.length ? settle_guests : true
      if host_settled && guests_settled && !@control_unsettled
        @owned.reverse_each { |path| FileUtils.remove_entry(path) }
        File.delete(@active_marker)
      else
        warn 'FAIL: Native processes or simulator guests did not settle; destination locks retained for inspection.'
        raise 'Native cleanup failed'
      end
    end
    code = 1 if @interrupted || (code == 0 && !@verdict)
    puts @verdict if code == 0
    code
  end
end

if $PROGRAM_NAME == __FILE__
  File.umask(0o077)
  $stdout.sync = true
  ENV.keys.each do |key|
    ENV.delete(key) if key.start_with?('GIT_') || %w[NATIVE_LOCAL_VIDEO_SOURCE XCODE_XCCONFIG_FILE SDKROOT TOOLCHAINS].include?(key)
  end
  begin
    exit NativeSimulatorLease.new(ARGV).run
  rescue StandardError => error
    allowed = ['Invalid full runner arguments', 'An absolute existing output directory is required',
               'Distinct explicit simulator UUIDs are required', 'Full verification requires an isolated archive snapshot',
               'Private local configuration must not enter the snapshot', 'Simulator inventory failed',
               'The explicit simulator could not be resolved', 'The two simulators must use the same device type',
               'Unsafe simulator lock directory', 'Simulator ownership lock exists; wait for the owner or inspect its retained private evidence',
               'Native cleanup failed', 'Native run cancelled']
    message = allowed.include?(error.message) || error.message.match?(/\ARequired tool unavailable: [a-z]+\z/) ? error.message : 'Native runner failed; private evidence retained'
    warn "FAIL: #{message}"
    exit 1
  end
end
