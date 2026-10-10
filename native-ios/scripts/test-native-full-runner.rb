#!/usr/bin/env ruby
# Exercise the real runner, product guards and validator; replace external build
# and native inspection command boundaries with disposable synthetic products.
require 'fileutils'
require 'json'
require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require 'tmpdir'
require_relative 'native-test-shards'

class NativeFullRunnerTest < Minitest::Test
  SCRIPT_ROOT = __dir__
  SIMULATOR = '00000000-0000-0000-0000-000000000027'
  SECONDARY = '00000000-0000-0000-0000-000000000028'

  def setup
    @root = Dir.mktmpdir('native-full-runner-test-')
    @snapshot = File.join(@root, 'snapshot')
    @output = File.join(@root, 'private-output')
    @bin = File.join(@root, 'bin')
    FileUtils.mkdir_p([File.join(@snapshot, 'native-ios/scripts'), File.join(@snapshot, 'native-ios/Config'), @output, @bin])
    %w[test-native-full.sh native-full-body.sh native-simulator-lease.rb native-test-shards.rb validate-native-test-results.rb verify-native-product.sh configure-apple-services.swift
       test-service-build.sh test-native-runtime-inspection.sh].each do |name|
      source = File.join(SCRIPT_ROOT, name)
      FileUtils.cp(source, File.join(@snapshot, 'native-ios/scripts', name)) if File.file?(source)
    end
    FileUtils.cp_r(File.join(SCRIPT_ROOT, 'fixtures'), File.join(@snapshot, 'native-ios/scripts'))
    FileUtils.cp_r(File.join(SCRIPT_ROOT, '../../assets'), @snapshot)
    File.write(File.join(@snapshot, 'native-ios/project-ci.yml'), "include: project.yml\n")
    @devices = { 'devices' => { 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' => [
      { 'udid' => SIMULATOR, 'name' => 'MetaShadowing Native Pre-push iOS 27',
        'isAvailable' => true, 'state' => 'Shutdown', 'deviceTypeIdentifier' => 'com.apple.CoreSimulator.SimDeviceType.iPhone-17' }
    ] } }
    @inventory = { 'errors' => [], 'values' => [{ 'disabledTests' => [], 'enabledTests' => [
      { 'identifier' => 'NativeFoundationUITests/PlayerUITests/testAudio()' },
      { 'identifier' => 'NativeMediaIntegrationTests/TransportTests/plays(video:)' }
    ] }] }
    @summary = { 'result' => 'Passed', 'totalTestCount' => 2, 'passedTests' => 2,
                 'failedTests' => 0, 'skippedTests' => 0 }
    @tests = { 'testNodes' => [{ 'nodeType' => 'Test Plan', 'result' => 'Passed', 'children' => [
      { 'nodeType' => 'UI test bundle', 'name' => 'NativeFoundationUITests', 'children' => [
        { 'nodeType' => 'Test Case', 'nodeIdentifier' => 'PlayerUITests/testAudio()', 'result' => 'Passed' }
      ] },
      { 'nodeType' => 'Unit test bundle', 'name' => 'NativeMediaIntegrationTests', 'children' => [
        { 'nodeType' => 'Test Case', 'nodeIdentifier' => 'TransportTests/plays(video:)', 'result' => 'Passed' }
      ] }
    ] }] }
    boundary = File.join(@bin, 'apple-command-fixture')
    File.write(boundary, <<~'RUBY')
      #!/usr/bin/env ruby
      require 'json'
      require 'fileutils'
      def selected_result(bundle)
        flags = JSON.parse(File.read(File.join(bundle, 'execution-args.json'))).grep(/\A-only-testing:/).map { |flag| flag.delete_prefix('-only-testing:') }
        tree = JSON.parse(File.read(ENV.fetch('NATIVE_FIXTURE_TESTS')))
        summary = JSON.parse(File.read(ENV.fetch('NATIVE_FIXTURE_SUMMARY')))
        unless flags.empty? || ENV['NATIVE_FIXTURE_UNFILTERED_RESULT'] == '1'
          bundles = tree.fetch('testNodes')[0].fetch('children')
          bundles.each do |target|
            target['children'].select! do |test|
              id = "#{target.fetch('name')}/#{test.fetch('nodeIdentifier')}"
              flags.any? { |flag| id == flag || id.start_with?(flag + '/') }
            end
          end
          bundles.reject! { |target| target['children'].empty? }
          count = bundles.sum { |target| target['children'].length }
          summary.merge!('totalTestCount' => count, 'passedTests' => count)
        end
        [summary, tree]
      end
      def app_fixture(path)
        FileUtils.mkdir_p(path)
        File.write(File.join(path, 'Info.plist'), <<~PLIST)
          <?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
          <key>CFBundleExecutable</key><string>MetaShadowingNative</string>
          <key>MinimumOSVersion</key><string>26.0</string>
          <key>UIDeviceFamily</key><array><integer>1</integer></array>
          <key>CFBundleIcons</key><dict><key>CFBundlePrimaryIcon</key><dict><key>CFBundleIconName</key><string>AppIcon</string></dict></dict>
          <key>NSMicrophoneUsageDescription</key><string>Fixture microphone</string>
          <key>UIBackgroundModes</key><array><string>audio</string></array>
          </dict></plist>
        PLIST
        File.write(File.join(path, 'MetaShadowingNative'), 'Synthetic Mach-O boundary')
        File.chmod(0o755, File.join(path, 'MetaShadowingNative'))
        File.write(File.join(path, 'Assets.car'), 'Compiled icon boundary')
        %w[talking-pup-512.webp talking-pup-still.png launch-wordmark.png].each do |name|
          FileUtils.cp(File.join('assets/brand', name), path)
        end
        FileUtils.cp_r('assets/sample', path)
      end
      tool = File.basename($PROGRAM_NAME)
      private_inputs = ENV.keys.select do |name|
        %w[NATIVE_LOCAL_VIDEO_SOURCE XCODE_XCCONFIG_FILE SDKROOT TOOLCHAINS].include?(name) || name.start_with?('GIT_')
      end
      File.open(ENV.fetch('NATIVE_FIXTURE_COMMANDS'), 'a') do |file|
        file.flock(File::LOCK_EX)
        file.puts JSON.generate([tool, ARGV, private_inputs, ENV['DEVELOPER_DIR']])
      end
      stage = nil
      case tool
      when 'xcodegen'
        abort 'Private configuration present' if File.exist?('native-ios/Config/Local.xcconfig')
        if ARGV == %w[generate --spec native-ios/project-ci.yml --quiet]
          stage = 'generation'
          FileUtils.mkdir_p('native-ios/MetaShadowingNative.xcodeproj')
        else
          stage = 'service-generation'
          abort 'Wrong service generation' unless ARGV[0, 2] == %w[generate --spec] && ARGV.last == '--quiet'
          spec = ARGV.fetch(ARGV.index('--spec') + 1)
          abort 'Fictional service configuration missing' unless File.file?(spec)
          project = File.join(ARGV.fetch(ARGV.index('--project') + 1), 'MetaShadowingNative.xcodeproj')
          FileUtils.mkdir_p(project)
          File.write(File.join(project, 'project.pbxproj'), "com.apple.product-type.extensionkit-extension\nEXTENSIONS_FOLDER_PATH\n")
        end
      when 'xcodebuild'
        if ARGV == ['-version']
          stage = 'version'
          puts "Xcode #{ENV.fetch('NATIVE_FIXTURE_XCODE', '27.0')}\nBuild version fixture"
        elsif ARGV.include?('-enumerate-tests')
          stage = 'enumeration'
          FileUtils.cp(ENV.fetch('NATIVE_FIXTURE_INVENTORY'), ARGV.fetch(ARGV.index('-test-enumeration-output-path') + 1))
        elsif ARGV.first == 'build-for-testing'
          stage = 'build'
          abort 'Fictional project was not generated' unless File.directory?('native-ios/MetaShadowingNative.xcodeproj')
          app_fixture(File.join(ARGV.fetch(ARGV.index('-testProductsPath') + 1), 'Binaries/0/Debug-iphonesimulator/MetaShadowingNative.app'))
        elsif ARGV.first == 'build'
          scheme = ARGV.fetch(ARGV.index('-scheme') + 1)
          configuration = ARGV.fetch(ARGV.index('-configuration') + 1)
          derived = ARGV.fetch(ARGV.index('-derivedDataPath') + 1)
          if scheme == 'SampleDownloader'
            stage = 'service-build'
            abort 'Wrong downloader configuration' unless configuration == 'Debug'
            FileUtils.mkdir_p(File.join(derived, 'Build/Products/Debug-iphonesimulator/SampleDownloader.appex'))
          else
            stage = 'release-build'
            abort 'Unexpected second Debug build' unless scheme == 'MetaShadowingNative' && configuration == 'Release'
            app_fixture(File.join(derived, 'Build/Products/Release-iphonesimulator/MetaShadowingNative.app'))
          end
        elsif ARGV.first == 'test-without-building'
          stage = 'execution'
          unless ENV['NATIVE_FIXTURE_MISSING_RESULT'] == '1'
            result = ARGV.fetch(ARGV.index('-resultBundlePath') + 1)
            FileUtils.mkdir_p(result)
            File.write(File.join(result, 'Info.plist'), 'finalized fixture')
            File.write(File.join(result, 'execution-args.json'), JSON.generate(ARGV))
            name = File.basename(File.dirname(result))
            if ENV['NATIVE_FIXTURE_CONCURRENCY'] == '1'
              events = ENV.fetch('NATIVE_FIXTURE_EVENTS')
              FileUtils.mkdir_p(events)
              if name == 'integration'
                File.write(File.join(events, 'integration-finished'), 'finished')
              elsif %w[ui-a ui-b].include?(name)
                abort 'UI started before integrations settled' unless File.exist?(File.join(events, 'integration-finished'))
                File.write(File.join(events, name + '.started'), Process.pid.to_s)
                deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 3
                until %w[ui-a ui-b].all? { |worker| File.exist?(File.join(events, worker + '.started')) }
                  abort 'UI workers did not overlap' if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
                  sleep 0.01
                end
                if ENV['NATIVE_FIXTURE_SHARD_FAIL'] == name
                  warn 'PRIVATE native shard failure'
                  exit 17
                end
                sleep 120 if ENV['NATIVE_FIXTURE_BLOCK_UI'] == name || ENV['NATIVE_FIXTURE_BLOCK_UI'] == 'both'
              end
            end
          end
        else
          abort 'Unexpected Xcode command'
        end
      when 'xcrun'
        if ARGV == %w[simctl list devices available --json]
          stage = 'devices'
          if ENV['NATIVE_FIXTURE_INVENTORY_BARRIER']
            barrier = ENV.fetch('NATIVE_FIXTURE_INVENTORY_BARRIER')
            File.write(barrier + '.started', 'inventory reached')
            sleep 0.01 until File.exist?(barrier + '.release')
          end
          puts File.read(ENV.fetch('NATIVE_FIXTURE_DEVICES'))
        elsif ARGV[0, 2] == %w[simctl boot]
          stage = 'boot'
          File.open(ENV.fetch('NATIVE_FIXTURE_DEVICES'), 'r+') do |file|
            file.flock(File::LOCK_EX)
            devices = JSON.parse(file.read)
            devices['devices'].values.flatten.find { |device| device['udid'] == ARGV[2] }['state'] = 'Booted'
            file.rewind; file.write(JSON.generate(devices)); file.truncate(file.pos)
          end
        elsif ARGV[0, 2] == %w[simctl bootstatus]
          stage = 'bootstatus'
        elsif ARGV[0, 2] == %w[simctl shutdown]
          stage = 'shutdown'
          if ENV['NATIVE_FIXTURE_SHUTDOWN_BARRIER']
            barrier = ENV.fetch('NATIVE_FIXTURE_SHUTDOWN_BARRIER')
            File.write(barrier + '.started', 'shutdown reached')
            sleep 0.01 until File.exist?(barrier + '.release')
          end
          unless ENV['NATIVE_FIXTURE_STUCK_GUEST'] == '1'
            File.open(ENV.fetch('NATIVE_FIXTURE_DEVICES'), 'r+') do |file|
              file.flock(File::LOCK_EX)
              devices = JSON.parse(file.read)
              devices['devices'].values.flatten.find { |device| device['udid'] == ARGV[2] }['state'] = 'Shutdown'
              file.rewind; file.write(JSON.generate(devices)); file.truncate(file.pos)
            end
          end
        elsif ARGV[0, 4] == %w[xcresulttool get test-results summary]
          stage = 'summary'
          puts JSON.generate(selected_result(ARGV.fetch(ARGV.index('--path') + 1)).first)
        elsif ARGV[0, 4] == %w[xcresulttool get test-results tests]
          stage = 'report'
          puts JSON.generate(selected_result(ARGV.fetch(ARGV.index('--path') + 1)).last)
        elsif ARGV[0, 3] == %w[--sdk macosx clang]
          stage = ARGV.include?('-dynamiclib') ? 'runtime-dependency-build' : 'runtime-consumer-build'
          output = ARGV.fetch(ARGV.index('-o') + 1)
          File.write(output, 'Synthetic Mach-O compile boundary')
          File.chmod(0o755, output)
        else
          abort 'Unexpected Apple command'
        end
      when 'swift'
        stage = 'service-configuration'
        abort 'Only fictional downloader configuration may use Swift here' unless ARGV[0].end_with?('/scripts/configure-apple-services.swift') && File.file?(ARGV[0]) && ARGV[1] == '--fixture-output' && ARGV.length == 3
        config = ARGV.fetch(2)
        FileUtils.mkdir_p(config)
        File.write(File.join(config, 'project.json'), '{}')
      when 'ditto'
        stage = 'runtime-copy'
        FileUtils.cp_r(ARGV.fetch(0), ARGV.fetch(1), preserve: true)
      else
        abort 'Unexpected package or tool operation'
      end
      if ENV['NATIVE_FIXTURE_FAIL'] == stage
        warn 'PRIVATE native command diagnostic'
        exit 17
      end
    RUBY
    File.chmod(0o755, boundary)
    %w[xcodegen xcodebuild xcrun swift ditto].each { |name| File.symlink(boundary, File.join(@bin, name)) }
    product_boundary = File.join(@bin, 'product-command-fixture')
    File.write(product_boundary, <<~'SH')
      #!/bin/bash
      case "${0##*/}" in
        file)
          case "$2" in */MetaShadowingNative|*/RuntimeDependencyFixture) echo 'Mach-O arm64 executable' ;; *) echo 'Fixture resource' ;; esac ;;
        otool)
          echo "$2:"
          if [[ "$2" == */RuntimeDependencyFixture && "${NATIVE_FIXTURE_ACCEPT_FORBIDDEN:-}" != 1 ]]; then
            echo '    @rpath/hermes.framework/hermes (compatibility version 0.0.0)'
          fi ;;
        nm) : ;;
        codesign)
          case "$*" in *Debug-iphonesimulator*) exit 0 ;; *) exit 1 ;; esac ;;
        strings)
          if [[ "${NATIVE_FIXTURE_FAIL:-}" == debug-product && "$1" == */Debug-iphonesimulator/* ]]; then echo _RCT; fi
          if [[ "${NATIVE_FIXTURE_FAIL:-}" == release-product && "$1" == */Release-iphonesimulator/* ]]; then echo 'ui-test-fixture'; fi ;;
      esac
      if [[ "${NATIVE_FIXTURE_FAIL:-}" == debug-product && "${0##*/}" == otool && "$2" == */Debug-iphonesimulator/* ]]; then
        echo '    @rpath/hermes.framework/hermes (compatibility version 0.0.0)'
      fi
    SH
    File.chmod(0o755, product_boundary)
    %w[file otool nm codesign strings].each { |name| File.symlink(product_boundary, File.join(@bin, name)) }
    { 'ruby' => RbConfig.ruby, 'jq' => '/usr/bin/jq', 'mktemp' => '/usr/bin/mktemp', 'dirname' => '/usr/bin/dirname',
      'bash' => '/bin/bash', 'mkdir' => '/bin/mkdir', 'rm' => '/bin/rm', 'grep' => '/usr/bin/grep',
      'sed' => '/usr/bin/sed', 'cmp' => '/usr/bin/cmp', 'plutil' => '/usr/bin/plutil',
      'rg' => Open3.capture2('which', 'rg').first.strip }.each do |name, executable|
      File.symlink(executable, File.join(@bin, name))
    end
    @environment = { 'PATH' => @bin,
                     'NATIVE_FIXTURE_COMMANDS' => File.join(@root, 'commands.jsonl') }
  end

  def teardown
    [SIMULATOR, SECONDARY].each do |id|
      lock = File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}", id)
      owner = File.join(lock, 'owner.json')
      if File.file?(owner) && JSON.parse(File.read(owner)).fetch('evidence').start_with?(@root + '/')
        FileUtils.remove_entry(lock)
      end
    end
    FileUtils.remove_entry(@root)
  end

  def fixture_inputs
    { 'DEVICES' => @devices, 'INVENTORY' => @inventory, 'SUMMARY' => @summary, 'TESTS' => @tests }.each do |label, value|
      path = File.join(@root, "#{label.downcase}.json")
      File.write(path, JSON.generate(value))
      @environment["NATIVE_FIXTURE_#{label}"] = path
    end
  end

  def run_full(arguments = ['--simulator-id', SIMULATOR, '--output-dir', @output])
    fixture_inputs
    Open3.capture3(@environment, '/bin/bash', 'native-ios/scripts/test-native-full.sh', *arguments, chdir: @snapshot)
  end

  def wait_until(message)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 15
    until yield
      flunk message if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.02
    end
  end

  # Cancellation before ownership/build must remain actionable without starting work.
  def test_early_cancellation_reports_cancelled_without_acquiring_devices
    pid = nil
    %w[INT TERM].each do |signal|
      barrier = File.join(@root, "inventory-#{signal}")
      @environment['NATIVE_FIXTURE_INVENTORY_BARRIER'] = barrier
      fixture_inputs
      log = File.join(@root, "early-cancel-#{signal}.log")
      pid = Process.spawn(@environment, '/bin/bash', 'native-ios/scripts/test-native-full.sh',
                          '--simulator-id', SIMULATOR, '--output-dir', @output,
                          chdir: @snapshot, out: log, err: [:child, :out], pgroup: true)
      wait_until('Inventory inspection did not start') { File.exist?(barrier + '.started') }
      Process.kill(signal, pid)
      File.write(barrier + '.release', 'complete inventory')
      result = nil
      wait_until('Early cancellation did not settle') { result = Process.waitpid2(pid, Process::WNOHANG) }
      pid = nil
      output = File.read(log)
      refute result.last.success?, output
      assert_includes output, 'FAIL: Native run cancelled'
      refute_includes output, 'PASS:'
      refute_includes output, @root
      refute_includes output, SIMULATOR
      assert commands.all? { |tool, args| tool == 'xcrun' && args == %w[simctl list devices available --json] },
             'Early cancellation must not generate, build, boot, shut down or test.'
      refute File.exist?(File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}", SIMULATOR))
      assert_empty Dir.glob(File.join(@output, 'native-lease-*/active'))
    end
  ensure
    if pid
      Process.kill('TERM', -pid) rescue nil
      Process.waitpid(pid) rescue nil
    end
  end

  # A cancelled run must never publish success, even after XCTest has passed.
  def test_cancellation_during_guest_cleanup_withholds_pass
    barrier = File.join(@root, 'shutdown')
    @environment['NATIVE_FIXTURE_SHUTDOWN_BARRIER'] = barrier
    fixture_inputs
    log = File.join(@root, 'async.log')
    pid = Process.spawn(@environment, '/bin/bash', 'native-ios/scripts/test-native-full.sh',
                        '--simulator-id', SIMULATOR, '--output-dir', @output,
                        chdir: @snapshot, out: log, err: [:child, :out], pgroup: true)
    wait_until('Guest cleanup did not start') { File.exist?(barrier + '.started') }
    Process.kill('TERM', pid)
    File.write(barrier + '.release', 'continue cleanup')
    result = nil
    wait_until('Cancelled supervisor did not finish') { result = Process.waitpid2(pid, Process::WNOHANG) }
    pid = nil
    refute result.last.success?, 'Cancellation after tests passed must still fail the run.'
    refute_includes File.read(log), 'PASS:'
    assert_equal 'Shutdown', JSON.parse(File.read(@environment.fetch('NATIVE_FIXTURE_DEVICES')))['devices'].values.first.first['state']
    refute File.exist?(File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}", SIMULATOR))
  ensure
    if pid
      Process.kill('TERM', -pid) rescue nil
      Process.waitpid(pid) rescue nil
    end
  end

  def commands
    path = @environment.fetch('NATIVE_FIXTURE_COMMANDS')
    File.exist?(path) ? File.readlines(path).map { |line| JSON.parse(line) } : []
  end

  def parallel_fixture
    @devices['devices'].values.first << @devices['devices'].values.first.first.merge('udid' => SECONDARY)
    @inventory['values'][0]['enabledTests'] << { 'identifier' => 'NativeFoundationUITests/ProductUITests/testSettings()' }
    @summary.merge!('totalTestCount' => 3, 'passedTests' => 3)
    @tests['testNodes'][0]['children'][0]['children'] << {
      'nodeType' => 'Test Case', 'nodeIdentifier' => 'ProductUITests/testSettings()', 'result' => 'Passed'
    }
    @environment['NATIVE_FIXTURE_CONCURRENCY'] = '1'
    @environment['NATIVE_FIXTURE_EVENTS'] = File.join(@root, 'events')
    ['--simulator-id', SIMULATOR, '--output-dir', @output, '--secondary-simulator-id', SECONDARY]
  end

  def assert_fixture_workers_gone
    Dir.glob(File.join(@root, 'events', '*.started')).each do |file|
      pid = Integer(File.read(file))
      assert_raises(Errno::ESRCH) { Process.kill(0, pid) }
    end
    assert @devices['devices'].values.flatten.all? { |device| device['state'] == 'Shutdown' }
    current = JSON.parse(File.read(@environment.fetch('NATIVE_FIXTURE_DEVICES')))
    assert current['devices'].values.flatten.all? { |device| device['state'] == 'Shutdown' }
  end

  # A second destination must partition, not duplicate, the compiled inventory.
  # Integrations precede both UI workers; each worker keeps serial XCTest.
  def test_two_devices_execute_integrations_then_disjoint_ui_selections
    output, error, status = run_full(parallel_fixture)
    assert status.success?, error
    assert_includes output, 'PASS: 3 native test cases matched the selected inventory.'
    executions = commands.select { |tool, args| tool == 'xcodebuild' && args.first == 'test-without-building' && !args.include?('-enumerate-tests') }.map { |_, args| args }
    assert_equal 3, executions.length
    assert_equal ['-only-testing:NativeMediaIntegrationTests'], executions.first.grep(/\A-only-testing:/)
    assert_equal [
      ['-only-testing:NativeFoundationUITests/PlayerUITests'],
      ['-only-testing:NativeFoundationUITests/ProductUITests']
    ], executions.drop(1).map { |args| args.grep(/\A-only-testing:/) }.sort
    assert_equal 3, executions.map { |args| args.fetch(args.index('-resultBundlePath') + 1) }.uniq.length
    assert_equal 3, executions.map { |args| args.fetch(args.index('-testProductsPath') + 1) }.uniq.length
    assert_equal [SIMULATOR, SECONDARY].sort, executions.drop(1).map { |args| args.fetch(args.index('-destination') + 1)[/id=([^,]+)/, 1] }.sort
    executions.each { |args| assert_equal 'NO', args.fetch(args.index('-parallel-testing-enabled') + 1) }
    assert_fixture_workers_gone
  end

  # A failing sibling must not wait for a long-running UI selection or hide it.
  def test_failed_ui_worker_stops_sibling_and_drains_both_guests
    arguments = parallel_fixture
    @environment['NATIVE_FIXTURE_SHARD_FAIL'] = 'ui-b'
    @environment['NATIVE_FIXTURE_BLOCK_UI'] = 'ui-a'
    output, error, status = run_full(arguments)
    refute status.success?
    refute_includes output + error, 'PASS:'
    refute_includes output + error, 'PRIVATE native shard failure'
    assert_fixture_workers_gone
  end

  # Cancelling the supervisor, not only its immediate children, must drain all work.
  def test_cancelling_active_ui_workers_releases_only_after_both_guests_stop
    arguments = parallel_fixture
    @environment['NATIVE_FIXTURE_BLOCK_UI'] = 'both'
    fixture_inputs
    log = File.join(@root, 'async.log')
    pid = Process.spawn(@environment, '/bin/bash', 'native-ios/scripts/test-native-full.sh', *arguments,
                        chdir: @snapshot, out: log, err: [:child, :out], pgroup: true)
    wait_until('Both UI workers did not start') { %w[ui-a ui-b].all? { |name| File.exist?(File.join(@root, 'events', name + '.started')) } }
    Process.kill('TERM', pid)
    result = nil
    wait_until('Cancelled workers did not drain') { result = Process.waitpid2(pid, Process::WNOHANG) }
    pid = nil
    refute result.last.success?
    refute_includes File.read(log), 'PASS:'
    assert_fixture_workers_gone
  ensure
    if pid
      Process.kill('TERM', -pid) rescue nil
      Process.waitpid(pid) rescue nil
    end
  end

  # Unknown classes and targets need a reviewed owner, not implicit omission.
  def test_partition_rejects_unknown_ambiguous_and_empty_owners
    parallel_fixture
    bins = NativeTestShards.partition(@inventory)
    assert_equal ['NativeFoundationUITests/PlayerUITests/testAudio()'], bins.fetch('ui-a')
    assert_equal ['NativeFoundationUITests/ProductUITests/testSettings()'], bins.fetch('ui-b')
    assert_equal ['NativeMediaIntegrationTests/TransportTests/plays(video:)'], bins.fetch('integration')
    original = Marshal.dump(@inventory)
    [
      ->(ids) { ids[0]['identifier'] = 'NativeFoundationUITests/FutureUITests/testNew()' },
      ->(ids) { ids[1]['identifier'] = 'FutureTarget/TransportTests/plays(video:)' },
      ->(ids) { ids.pop },
      ->(ids) { ids << ids.first.dup }
    ].each do |change|
      inventory = Marshal.load(original)
      change.call(inventory['values'][0]['enabledTests'])
      assert_raises(RuntimeError) { NativeTestShards.partition(inventory) }
    end
  end

  # Successful commands with incomplete/duplicated results cannot approve the union.
  def test_unfiltered_shard_result_is_rejected
    arguments = parallel_fixture
    @environment['NATIVE_FIXTURE_UNFILTERED_RESULT'] = '1'
    output, error, status = run_full(arguments)
    refute status.success?
    refute_includes output + error, 'PASS:'
    refute commands.any? { |tool, args| tool == 'xcodebuild' && args.include?('-only-testing:NativeFoundationUITests/PlayerUITests') }
  end

  # A successful test result cannot release a device that still has live guests.
  def test_unsettled_guest_retains_ownership_and_withholds_pass
    @environment['NATIVE_FIXTURE_STUCK_GUEST'] = '1'
    output, error, status = run_full
    refute status.success?
    refute_includes output, 'PASS:'
    assert_includes error, 'locks retained'
    assert File.file?(File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}", SIMULATOR, 'owner.json'))
    assert_equal 1, Dir.glob(File.join(@output, 'native-lease-*/active')).length,
                 'The hook must know that separately grouped work has not settled.'
  end

  # Inject the OS reporting a still-live control group after its leader exited.
  # The real bounded drain and final verdict must reject this unresolved state.
  def test_unsettled_control_group_cannot_release_simulator_leases
    fixture_inputs
    driver = File.join(@root, 'control-probe.rb')
    File.write(driver, <<~RUBY)
      require #{File.join(@snapshot, 'native-ios/scripts/native-simulator-lease.rb').inspect}
      class NativeSimulatorLease
        alias observed_group_alive? group_alive?
        def group_alive?(pid)
          return true if @cleanup_deadline && pid != @pid
          observed_group_alive?(pid)
        end
      end
      begin
        exit NativeSimulatorLease.new(ARGV).run
      rescue StandardError
        exit 1
      end
    RUBY
    output, error, status = Open3.capture3(@environment, RbConfig.ruby, driver,
      '--simulator-id', SIMULATOR, '--output-dir', @output, chdir: @snapshot)
    refute status.success?
    refute_includes output, 'PASS:'
    assert_includes error, 'locks retained'
    assert File.file?(File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}", SIMULATOR, 'owner.json'))
  end

  # A separate clone's ownership must block execution without stealing its lock.
  def test_existing_destination_owner_blocks_all_native_work
    lock = File.join(File.realpath('/tmp'), "metashadowing-native-simulators-#{Process.uid}", SIMULATOR)
    FileUtils.mkdir_p(File.dirname(lock), mode: 0o700)
    Dir.mkdir(lock, 0o700)
    created = true
    marker = JSON.generate(pid: Process.pid, evidence: '/fixture/another-owner')
    File.write(File.join(lock, 'owner.json'), marker)
    output, error, status = run_full
    refute status.success?
    assert_includes error, 'ownership lock exists'
    refute_includes output, 'PASS:'
    refute commands.any? { |tool, args| tool == 'xcodebuild' || tool == 'xcodegen' || (tool == 'xcrun' && args[1] != 'list') }
    assert_equal marker, File.read(File.join(lock, 'owner.json'))
  ensure
    FileUtils.remove_entry(lock) if created
  end

  # Explicit identities alone do not authorize mismatched or reference devices.
  def test_secondary_identity_type_and_reference_guards_run_before_builds
    arguments = parallel_fixture
    original = Marshal.dump(@devices)
    [
      ->(device) { device['deviceTypeIdentifier'] = 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro' },
      ->(device) { device['name'] = 'MetaShadowing Native W2 iOS 27' },
      ->(device) { device['name'] = 'MetaShadowing Native Pre-push W2 iOS 27' },
      ->(device) { device['name'] = 'MetaShadowing Native Pre-push w2 iOS 27' },
      ->(device) { device['isAvailable'] = false }
    ].each do |change|
      @devices = Marshal.load(original)
      change.call(@devices['devices'].values.first.last)
      FileUtils.rm_f(@environment.fetch('NATIVE_FIXTURE_COMMANDS'))
      _, _, status = run_full(arguments)
      refute status.success?
      refute commands.any? { |tool, _| %w[xcodebuild xcodegen].include?(tool) }
    end
    _, _, status = run_full(['--simulator-id', SIMULATOR, '--output-dir', @output, '--secondary-simulator-id', SIMULATOR])
    refute status.success?
  end

  def assert_rejected_before_mutation
    output, error, status = run_full
    refute status.success?, 'Unsafe verification target must fail.'
    refute commands.any? { |tool, args| tool == 'xcodegen' || (tool == 'xcodebuild' && args != ['-version']) || (tool == 'xcrun' && %w[boot bootstatus].include?(args[1])) },
           'Rejected targets must not generate, build, boot or test.'
    refute_includes output + error, @root
    refute_includes output + error, SIMULATOR
  end

  # Omitting real full selection, enumeration, or exact finalized validation
  # must prevent the full runner from approving an isolated snapshot.
  def test_full_snapshot_builds_and_passes_the_complete_native_inventory
    output, error, status = run_full
    assert status.success?, error
    assert_includes output, 'PASS: 2 native test cases matched the selected inventory.'
    assert_equal %w[build-for-testing build build test-without-building test-without-building],
                 commands.select { |tool, args| tool == 'xcodebuild' && args != ['-version'] }.map { |_, args| args.first }
    assert_equal 1, commands.count { |tool, args| tool == 'xcrun' && args[0, 2] == %w[simctl boot] }
    refute_includes output + error, SIMULATOR
    refute_includes output + error, @root
    assert_empty Dir.glob(File.join(@output, 'native-lease-*/active'))
  end

  # Matching an ID alone could operate on W2, a user mirror, or an unavailable
  # simulator. Only the separately provisioned pre-push device is authorized.
  def test_only_the_explicit_available_ios_27_pre_push_simulator_is_accepted
    original = Marshal.dump(@devices)
    [
      ->(device) { device['name'] = 'MetaShadowing Native W2 iOS 27' },
      ->(device) { device['name'] = 'MetaShadowing Native Pre-push W2 iOS 27' },
      ->(device) { device['name'] = 'MetaShadowing Native Pre-push w2 iOS 27' },
      ->(device) { device['name'] = 'Reference iPhone' },
      ->(device) { device['isAvailable'] = false },
      ->(device) { device['isAvailable'] = 'true' },
      ->(device) { device['state'] = 'Creating' },
      ->(device) { device['udid'] = '00000000-0000-0000-0000-000000000026' },
      ->(_device) { @devices['devices']['com.apple.CoreSimulator.SimRuntime.iOS-26-0'] = @devices['devices'].delete('com.apple.CoreSimulator.SimRuntime.iOS-27-0') },
      ->(device) { @devices['devices']['com.apple.CoreSimulator.SimRuntime.iOS-27-0'] << device.dup }
    ].each do |change|
      @devices = Marshal.load(original)
      FileUtils.rm_f(@environment.fetch('NATIVE_FIXTURE_COMMANDS'))
      change.call(@devices['devices']['com.apple.CoreSimulator.SimRuntime.iOS-27-0'][0])
      assert_rejected_before_mutation
    end
  end

  # Running inside a checkout or accepting private local signing configuration
  # would make the runner operate on the working tree rather than its snapshot.
  def test_refuses_git_checkouts_and_private_local_configuration
    git_path = File.join(@snapshot, '.git')
    File.write(git_path, 'gitdir: private checkout')
    assert_rejected_before_mutation
    FileUtils.rm_f(git_path)
    FileUtils.rm_f(@environment.fetch('NATIVE_FIXTURE_COMMANDS'))
    File.write(File.join(@snapshot, 'native-ios/Config/Local.xcconfig'), 'PRIVATE signing configuration')
    assert_rejected_before_mutation
  end

  # An older selected Xcode must fail before simulator mutation or project work.
  def test_requires_xcode_27
    @environment['NATIVE_FIXTURE_XCODE'] = '26.4'
    assert_rejected_before_mutation
  end

  # A generic/disabled/empty enumeration must stop before it starts heavy tests.
  def test_bad_enumeration_is_rejected_before_test_execution
    original = Marshal.dump(@inventory)
    [
      -> { @inventory['errors'] = ['PRIVATE enumeration diagnostic'] },
      -> { @inventory['values'][0]['disabledTests'] = [{ 'identifier' => 'Target/Suite/testDisabled()' }] },
      -> { @inventory['values'][0]['enabledTests'] = [] },
      -> { @inventory['values'][0]['enabledTests'][0]['identifier'] = 'NativeFoundationUITests' },
      -> { @inventory['values'][0]['enabledTests'].pop }
    ].each do |change|
      @inventory = Marshal.load(original)
      FileUtils.rm_f(@environment.fetch('NATIVE_FIXTURE_COMMANDS'))
      change.call
      output, error, status = run_full
      refute status.success?, 'Bad full enumeration must fail.'
      refute commands.any? { |tool, args| tool == 'xcodebuild' && args.first == 'test-without-building' && !args.include?('-enumerate-tests') },
             'Invalid enumeration must not start tests.'
      refute_includes output + error, 'PRIVATE'
    end
  end

  # Duplicate options would silently replace the simulator or output choice.
  def test_cli_rejects_missing_relative_unknown_and_duplicate_arguments
    [
      [], ['--simulator-id', SIMULATOR], ['--output-dir', @output],
      ['--simulator-id', SIMULATOR, '--output-dir', 'relative'],
      ['--simulator-id', SIMULATOR, '--output-dir', File.join(@root, 'absent')],
      ['--simulator-id', SIMULATOR, '--output-dir', @output, '--unknown', 'value'],
      ['--simulator-id', SIMULATOR, '--output-dir', @output, '--simulator-id', SIMULATOR],
      ['--simulator-id', SIMULATOR, '--output-dir', @output, '--output-dir', @output]
    ].each do |arguments|
      FileUtils.rm_f(@environment.fetch('NATIVE_FIXTURE_COMMANDS'))
      _, _, status = run_full(arguments)
      refute status.success?, 'Invalid CLI arguments must fail.'
      assert_empty commands, 'Invalid arguments must not invoke native tools.'
    end
  end

  # Swallowing any native command exit would authorize a push after a failed
  # build, simulator preparation, enumeration, execution, or result export.
  def test_each_external_failure_blocks_the_full_run_without_leaking_diagnostics
    %w[version devices generation build debug-product release-build release-product
       service-configuration service-generation service-build runtime-copy
       runtime-dependency-build runtime-consumer-build boot bootstatus enumeration execution summary report].each do |stage|
      FileUtils.rm_f(@environment.fetch('NATIVE_FIXTURE_COMMANDS'))
      @environment['NATIVE_FIXTURE_FAIL'] = stage
      output, error, status = run_full
      refute status.success?, "#{stage} failure must block verification."
      refute_includes output + error, 'PRIVATE'
      refute_includes output + error, @root
      refute_includes output + error, 'PASS:'
      if %w[debug-product release-build release-product service-configuration service-generation
            service-build runtime-copy runtime-dependency-build runtime-consumer-build].include?(stage)
        refute commands.any? { |tool, args| tool == 'xcrun' && %w[boot bootstatus].include?(args[1]) },
               "#{stage} must fail before simulator preparation."
        refute commands.any? { |tool, args| tool == 'xcodebuild' && args.first == 'test-without-building' }
      end
    end
  end

  # Already booted devices must not receive a second boot or any destructive
  # operation; tests must remain complete, serial, and tied to this exact ID.
  def test_booted_device_is_reused_with_full_serial_selection_and_private_outputs
    @devices['devices']['com.apple.CoreSimulator.SimRuntime.iOS-27-0'][0]['state'] = 'Booted'
    _, error, status = run_full
    assert status.success?, error
    refute commands.any? { |tool, args| tool == 'xcrun' && args[0, 2] == %w[simctl boot] }
    commands.select { |tool, args| tool == 'xcodebuild' && args.first == 'test-without-building' }.each do |_, args|
      assert_equal "platform=iOS Simulator,id=#{SIMULATOR},arch=arm64", args.fetch(args.index('-destination') + 1)
      assert_equal 'NO', args.fetch(args.index('-parallel-testing-enabled') + 1)
      assert_includes args, 'CODE_SIGNING_ALLOWED=YES'
      assert_includes args, 'CODE_SIGN_IDENTITY=-'
      refute args.any? { |argument| argument.start_with?('-only-testing:', '-skip-testing:') }
      refute args.include?('-retry-tests-on-failure')
    end
    execution = commands.find { |tool, args| tool == 'xcodebuild' && args.first == 'test-without-building' && !args.include?('-enumerate-tests') }[1]
    assert_equal 'never', execution.fetch(execution.index('-collect-test-diagnostics') + 1)
    refute commands.any? { |tool, args| tool == 'swift' && args.first == 'test' },
           'Package suites remain mandatory remote checks.'
    assert_equal %w[bootstatus list list list list shutdown], commands.select { |tool, args| tool == 'xcrun' && args.first == 'simctl' }.map { |_, args| args[1] }.sort
    assert_equal 'Shutdown', JSON.parse(File.read(@environment.fetch('NATIVE_FIXTURE_DEVICES')))['devices'].values.first.first['state']
    paths = Dir.glob(File.join(@output, 'native-full.*'))
    assert_equal 1, paths.length
    assert_equal 0o700, File.stat(paths[0]).mode & 0o777
    assert_equal [], JSON.parse(File.read(File.join(paths[0], 'selection.json')))
    Dir.glob(File.join(paths[0], '*.json')).each { |path| assert_equal 0o600, File.stat(path).mode & 0o777 }
  end

  # Command success is insufficient without a finalized, complete, unskipped
  # result. The real validator, rather than a replacement mock, enforces this.
  def test_missing_empty_partial_failed_and_skipped_results_block_verification
    changes = [
      -> { @environment['NATIVE_FIXTURE_MISSING_RESULT'] = '1' },
      -> { @summary['result'] = 'Failed' },
      -> { @summary['skippedTests'] = 1 },
      -> { @tests['testNodes'] = []; @summary.merge!('totalTestCount' => 0, 'passedTests' => 0) },
      -> { @tests['testNodes'][0]['children'].pop; @summary.merge!('totalTestCount' => 1, 'passedTests' => 1) },
      -> { @tests['testNodes'][0]['children'][0]['children'][0]['result'] = 'Failed' }
    ]
    original = Marshal.dump([@summary, @tests])
    changes.each do |change|
      @summary, @tests = Marshal.load(original)
      @environment.delete('NATIVE_FIXTURE_MISSING_RESULT')
      change.call
      output, error, status = run_full
      refute status.success?, 'An unfinished or partial suite must fail.'
      refute_includes output + error, 'PASS:'
    end
  end

  # Tool discovery must not fall back to any installed Apple command in tests.
  def test_missing_required_tool_fails_before_any_native_operation
    %w[xcodegen swift rg file otool nm codesign plutil strings cmp ditto grep sed mkdir rm].each do |name|
      path = File.join(@bin, name)
      target = File.readlink(path)
      FileUtils.rm_f(path)
      output, error, status = run_full
      refute status.success?, "Missing #{name} must fail closed."
      assert_empty commands
      assert_includes output + error, "Required tool unavailable: #{name}"
      File.symlink(target, path)
    end
  end

  # Suppressing bounded phase feedback leaves a long local pre-push opaque;
  # forwarding raw Apple output would disclose private diagnostic metadata.
  def test_long_run_emits_only_fixed_phases_and_the_sanitized_verdict
    output, error, status = run_full
    assert status.success?, error
    assert_equal [
      'Native full: generating project.', 'Native full: building test products.',
      'Native full: inspecting Debug product.', 'Native full: building Release product.',
      'Native full: inspecting Release product.', 'Native full: building fictional downloader.',
      'Native full: checking runtime inspection guard.',
      'Native full: preparing simulator.', 'Native full: enumerating tests.',
      'Native full: running all native tests.', 'Native full: validating results.',
      'PASS: 2 native test cases matched the selected inventory.'
    ], output.lines.map(&:chomp)
  end

  # Reusing the compiled Debug app avoids a second app build. Release and the
  # fictional downloader use generic unsigned destinations before any test run.
  def test_build_guard_arguments_and_order_preserve_generic_unsigned_product_builds
    _, error, status = run_full
    assert status.success?, error
    assert_equal %w[xcrun xcodebuild xcrun xcodegen xcodebuild xcodebuild swift xcodegen xcodebuild ditto xcrun xcrun xcrun xcrun xcodebuild xcodebuild xcrun xcrun xcrun xcrun xcrun],
                 commands.map(&:first)
    builds = commands.select { |tool, args| tool == 'xcodebuild' && %w[build-for-testing build].include?(args.first) }.map { |_, args| args }
    assert_equal ['Debug', 'Release', 'Debug'], builds.map { |args| args.fetch(args.index('-configuration') + 1) }
    assert_equal ['MetaShadowingNative', 'MetaShadowingNative', 'SampleDownloader'], builds.map { |args| args.fetch(args.index('-scheme') + 1) }
    builds.each { |args| assert_equal 'generic/platform=iOS Simulator', args.fetch(args.index('-destination') + 1) }
    assert_includes builds.first, 'CODE_SIGNING_ALLOWED=YES'
    assert_includes builds.first, 'CODE_SIGN_IDENTITY=-'
    builds.drop(1).each do |args|
      assert_includes args, 'CODE_SIGNING_ALLOWED=NO'
      refute args.any? { |argument| argument.start_with?('DEVELOPMENT_TEAM=', 'CODE_SIGN_IDENTITY=') }
    end
    assert_equal 'iphonesimulator', builds[1].fetch(builds[1].index('-sdk') + 1)
    assert_includes builds[1], 'ARCHS=arm64'
    assert commands.find { |tool, _| tool == 'ditto' }[1].first.end_with?('/Build/Products/Release-iphonesimulator/MetaShadowingNative.app')
    %w[debug-product.log release-build.log release-product.log service-build.log runtime-inspection.log].each do |name|
      paths = Dir.glob(File.join(@output, 'native-full.*', name))
      assert_equal 1, paths.length
      assert_equal 0o600, File.stat(paths.first).mode & 0o777
    end
  end

  # The real runtime-regression script must observe the product guard rejecting
  # the linked fixture; command success alone must not authorize the native run.
  def test_accepting_the_forbidden_runtime_fixture_blocks_the_full_gate
    @environment['NATIVE_FIXTURE_ACCEPT_FORBIDDEN'] = '1'
    output, error, status = run_full
    refute status.success?
    assert_includes error, 'Native runtime inspection regression failed'
    refute_includes output, 'PASS:'
    refute commands.any? { |tool, args| tool == 'xcodebuild' && args.first == 'test-without-building' }
    refute commands.any? { |tool, args| tool == 'xcrun' && %w[boot bootstatus].include?(args[1]) }
  end

  # A nonzero XCTest command can still finalize its bundle. Preserve its
  # exported evidence and original failure instead of reporting a passing tree.
  def test_failed_execution_retains_finalized_reports_without_a_pass_verdict
    @environment['NATIVE_FIXTURE_FAIL'] = 'execution'
    output, _, status = run_full
    assert_equal 17, status.exitstatus
    refute_includes output, 'PASS:'
    assert_equal 1, Dir.glob(File.join(@output, 'native-full.*/summary.json')).length
    assert_equal 1, Dir.glob(File.join(@output, 'native-full.*/tests.json')).length
  end

  # Inherited video/configuration and SDK/toolchain overrides could make a
  # snapshot validate external private bytes or a different compiler. Git
  # context could also redirect a post-build subprocess outside the snapshot.
  def test_native_tools_and_post_build_subprocesses_receive_no_private_overrides
    %w[NATIVE_LOCAL_VIDEO_SOURCE XCODE_XCCONFIG_FILE SDKROOT TOOLCHAINS
       GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_CONFIG_COUNT GIT_CONFIG_KEY_0
       GIT_CONFIG_VALUE_0 GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
       GIT_FUTURE_CONTEXT].each { |name| @environment[name] = 'PRIVATE fixture input' }
    @environment['DEVELOPER_DIR'] = '/fixture/selected-Xcode-27'
    output, error, status = run_full
    assert status.success?, error
    refute_empty commands
    commands.each do |tool, _, inputs, developer_dir|
      assert_empty inputs, "#{tool} must not inherit private override names."
      assert_equal '/fixture/selected-Xcode-27', developer_dir
    end
    refute_includes output + error, 'PRIVATE'
  end
end
