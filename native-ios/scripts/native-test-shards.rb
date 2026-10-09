#!/usr/bin/env ruby
require 'json'
require 'digest'
require 'fileutils'
require 'open3'
require 'rbconfig'

module NativeTestShards
  UI_A = %w[PlayerUITests NativeFoundationUITests DownloadLabUITests BookshelfUITests].freeze
  UI_B = %w[AppleServicesUITests ProductUITests ReferenceToolsUITests VoiceOverSemanticsUITests OfflineAcceptanceUITests NativeMediaUITests ProductAccessibilityUITests].freeze

  def self.partition(inventory)
    raise 'Invalid compiled inventory' unless inventory.fetch('errors').empty?
    identifiers = inventory.fetch('values').flat_map do |value|
      raise 'Disabled compiled tests' unless value.fetch('disabledTests').empty?
      value.fetch('enabledTests').map { |entry| entry.fetch('identifier') }
    end
    raise 'Empty or ambiguous compiled inventory' if identifiers.empty? || identifiers.map { |id| id.split('/', 2).last }.uniq.length != identifiers.length
    bins = { 'integration' => [], 'ui-a' => [], 'ui-b' => [] }
    identifiers.each do |id|
      raise 'Invalid compiled identifier' unless id.match?(%r{\A[A-Za-z_][A-Za-z0-9_.]*/[A-Za-z_][A-Za-z0-9_.]*/[A-Za-z_][A-Za-z0-9_]*\([A-Za-z0-9_:]*\)\z})
      target, suite = id.split('/')
      bin = if target == 'NativeMediaIntegrationTests'
        'integration'
      elsif target == 'NativeFoundationUITests' && UI_A.include?(suite)
        'ui-a'
      elsif target == 'NativeFoundationUITests' && UI_B.include?(suite)
        'ui-b'
      end
      raise 'A compiled target or UI class has no reviewed owner' unless bin
      bins.fetch(bin) << id
    end
    raise 'A required selection is empty' if bins.values.any?(&:empty?)
    raise 'Overlapping or incomplete selections' unless bins.values.flatten.sort == identifiers.sort && bins.values.flatten.uniq.length == identifiers.length
    bins.transform_values { |ids| ids.sort }
  end

  def self.selection(name, ids)
    return ['-only-testing:NativeMediaIntegrationTests'] if name == 'integration'
    ids.map { |id| "-only-testing:#{id.split('/')[0, 2].join('/')}" }.uniq.sort
  end

  # Hash names, file modes, symlink targets and file bytes, never absolute paths.
  def self.product_digest(root)
    digest = Digest::SHA256.new
    Dir.glob(File.join(root, '**', '*'), File::FNM_DOTMATCH).sort.each do |path|
      next if %w[. ..].include?(File.basename(path))
      relative = path.delete_prefix(root + '/')
      stat = File.lstat(path)
      digest << JSON.generate([relative, stat.ftype, stat.mode & 0o777]) << "\n"
      if stat.symlink?
        digest << File.readlink(path) << "\n"
      elsif stat.file?
        digest << Digest::SHA256.file(path).hexdigest << "\n"
      elsif !stat.directory?
        raise 'Unsupported product entry'
      end
    end
    digest.hexdigest
  end

  class Runner
    def initialize(directory, products, first, second)
      @directory, @products, @ids = directory, products, [first, second]
      @inventory_path = File.join(directory, 'inventory.json')
      @bins = NativeTestShards.partition(JSON.parse(File.read(@inventory_path)))
      @active = {}
      @results = {}
      @timings = {}
    end

    def clock
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def path(name, file)
      File.join(@directory, name, file)
    end

    def stage
      master = NativeTestShards.product_digest(@products)
      @bins.each do |name, ids|
        FileUtils.mkdir_p(File.join(@directory, name))
        File.write(path(name, 'selection.json'), JSON.generate(NativeTestShards.selection(name, ids)))
        File.write(path(name, 'identifiers.json'), JSON.generate(ids))
        _, status = Open3.capture2e('ditto', @products, path(name, 'NativeTests.xctestproducts'))
        raise 'Test product staging failed' unless status.success?
        raise 'Staged products differ from the inspected build' unless NativeTestShards.product_digest(path(name, 'NativeTests.xctestproducts')) == master
      end
      File.write(File.join(@directory, 'product-digest.json'), JSON.generate(sha256: master))
      File.write(File.join(@directory, 'partitions.json'), JSON.generate(@bins))
      master
    end

    def start(name, id)
      arguments = ['xcodebuild', 'test-without-building', '-testProductsPath', path(name, 'NativeTests.xctestproducts'),
                   '-destination', "platform=iOS Simulator,id=#{id},arch=arm64", '-parallel-testing-enabled', 'NO',
                   '-collect-test-diagnostics', 'never', '-resultBundlePath', path(name, 'native.xcresult'),
                   'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-']
      arguments.concat(JSON.parse(File.read(path(name, 'selection.json'))))
      # Inherit the lease-owned body process group, including all descendants.
      pid = Process.spawn(*arguments, out: path(name, 'native.log'), err: [:child, :out])
      @active[pid] = [name, clock]
    end

    def collect(name, status, started)
      @timings[name] = { seconds: clock - started, exit_status: status.exitstatus }
      File.write(File.join(@directory, 'shard-timings.json'), JSON.generate(@timings))
      bundle = path(name, 'native.xcresult')
      raise 'A native result was not finalized' unless File.file?(File.join(bundle, 'Info.plist'))
      %w[summary tests].each do |kind|
        pid = Process.spawn('xcrun', 'xcresulttool', 'get', 'test-results', kind, '--path', bundle,
                            out: path(name, "#{kind}.json"), err: path(name, "#{kind}.log"))
        _, exported = Process.wait2(pid)
        raise 'Native result export failed' unless exported.success?
      end
      raise 'A native selection failed; original reports retained' unless status.success?
      output, checked = Open3.capture2e(RbConfig.ruby, File.join(__dir__, 'validate-native-test-results.rb'),
                                      @inventory_path, path(name, 'selection.json'), path(name, 'summary.json'), path(name, 'tests.json'))
      File.write(path(name, 'validation.log'), output)
      raise 'A native selection was incomplete or failed validation' unless checked.success?
      @results[name] = [JSON.parse(File.read(path(name, 'summary.json'))), JSON.parse(File.read(path(name, 'tests.json')))]
    end

    def wait_for_active
      until @active.empty?
        finished = Process.waitpid2(-1, Process::WNOHANG)
        if finished
          pid, status = finished
          name, started = @active.delete(pid)
          raise 'Unowned test process result' unless name
          collect(name, status, started)
        else
          sleep 0.1
        end
      end
    end

    def aggregate
      raise 'Missing native selections' unless @results.keys.sort == @bins.keys.sort
      summaries = @results.values.map(&:first)
      summary = { 'result' => 'Passed', 'totalTestCount' => summaries.sum { |s| s.fetch('totalTestCount') },
                  'passedTests' => summaries.sum { |s| s.fetch('passedTests') },
                  'failedTests' => 0, 'skippedTests' => 0, 'testFailures' => [] }
      tests = { 'testNodes' => @results.values.flat_map { |_, tree| tree.fetch('testNodes') } }
      File.write(File.join(@directory, 'selection.json'), '[]')
      File.write(File.join(@directory, 'summary.json'), JSON.generate(summary))
      File.write(File.join(@directory, 'tests.json'), JSON.generate(tests))
      output, status = Open3.capture2e(RbConfig.ruby, File.join(__dir__, 'validate-native-test-results.rb'),
                                     @inventory_path, File.join(@directory, 'selection.json'), File.join(@directory, 'summary.json'), File.join(@directory, 'tests.json'))
      raise 'Combined native result did not match the complete inventory' unless status.success?
      puts output
    end

    def run
      master = stage
      puts 'Native full: running native integrations.'
      start('integration', @ids.first)
      wait_for_active
      puts 'Native full: running two UI selections.'
      start('ui-a', @ids.first)
      start('ui-b', @ids.last)
      wait_for_active
      raise 'Inspected master products changed during execution' unless NativeTestShards.product_digest(@products) == master
      puts 'Native full: validating combined results.'
      aggregate
    end
  end
end

if $PROGRAM_NAME == __FILE__
  $stdout.sync = true
  begin
    raise 'Lease supervisor required' unless ARGV.length == 4 && File.file?(ENV.fetch('NATIVE_FULL_LEASE_STATE'))
    NativeTestShards::Runner.new(*ARGV).run
  rescue StandardError => error
    if ARGV.length == 4 && File.directory?(ARGV.first)
      File.write(File.join(ARGV.first, 'execution-error.log'), "#{error.class}: #{error.message}\n#{error.backtrace.join("\n")}\n")
    end
    # The outer lease drains the entire body group and both guests on failure.
    warn 'FAIL: Parallel native verification failed; private shard evidence retained.'
    exit 1
  end
end
