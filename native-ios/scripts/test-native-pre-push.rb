#!/usr/bin/env ruby
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'open3'
require 'json'
require 'timeout'
require 'digest'

class NativePrePushTest < Minitest::Test
  SOURCE = File.expand_path('../..', __dir__)
  ZERO = '0' * 40

  def setup
    @temporary = Dir.mktmpdir('native-hook-test-')
    @repo = File.join(@temporary, 'checkout')
    @remote = File.join(@temporary, 'remote.git')
    @bin = File.join(@temporary, 'bin')
    @record = File.join(@temporary, 'executed.jsonl')
    FileUtils.mkdir_p([@repo, @bin])
    @env = { 'PATH' => "#{@bin}:#{ENV.fetch('PATH')}", 'NATIVE_TEST_RECORD' => @record,
             'GIT_CONFIG_GLOBAL' => File.join(@temporary, 'absent-global'), 'GIT_CONFIG_NOSYSTEM' => '1' }
    git('init', '--quiet', '--initial-branch=dev')
    git('config', 'user.name', 'Hook Test')
    git('config', 'user.email', 'hook@example.invalid')
    git('config', 'core.hooksPath', '.githooks')
    git('config', 'native.prePushSimulator', '11111111-1111-4111-8111-111111111111')
    execute('git', 'init', '--quiet', '--bare', @remote)
    git('remote', 'add', 'origin', @remote)
    %w[.githooks/pre-push native-ios/scripts/native-pre-push.rb native-ios/scripts/install-native-git-hooks.sh].each do |relative|
      source = File.join(SOURCE, relative)
      next unless File.exist?(source)
      destination = File.join(@repo, relative)
      FileUtils.mkdir_p(File.dirname(destination))
      FileUtils.cp(source, destination)
      FileUtils.chmod(0o755, destination)
    end
    write('native-ios/public.txt', "committed\n")
    write('assets/sample/manifest.json', "committed asset\n")
    stub_tool('xcodebuild', '#!/bin/sh\nprintf "Xcode 27.0\\nBuild version 27A1\\n"\n'.gsub('\\n', "\n"))
    stub_tool('xcodegen', "#!/bin/sh\nprintf 'Version: 2.46.0\\n'\n")
    stub_tool('xcrun', <<~SH)
      #!/bin/sh
      printf '%s\n' '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-27-0":[{"udid":"11111111-1111-4111-8111-111111111111","name":"MetaShadowing Native Pre-push Tests","isAvailable":true}]}}'
    SH
  end

  def teardown
    FileUtils.remove_entry(@temporary)
  end

  # Removing the runner guard would allow an unverified commit onto the remote.
  def test_missing_runner_blocks_real_push
    oid = commit
    output, status = push(oid, 'refs/heads/dev')
    refute status.success?, output
    refute remote_ref('refs/heads/dev')
  end

  # Testing HEAD or dirty files would validate different bytes than Git publishes.
  def test_push_tests_exact_commit_without_dirty_or_private_files
    add_runner
    pushed = commit
    write('native-ios/public.txt', "later commit\n")
    commit
    write('native-ios/public.txt', "dirty working copy\n")
    write('native-ios/Config/Local.xcconfig', "private local setting\n")
    output, status = push(pushed, 'refs/heads/older')
    assert status.success?, output
    assert_equal pushed, remote_ref('refs/heads/older')
    assert_equal 1, records.length, 'The full runner must validate the pushed snapshot'
    assert_equal ['committed', false, true], records.fetch(0).values_at('content', 'private', 'output_exists')
    assert_equal "dirty working copy\n", File.read(File.join(@repo, 'native-ios/public.txt'))
  end

  # Native Xcode resources outside native-ios must come from the pushed commit.
  def test_snapshot_contains_committed_assets_without_working_copy_changes
    add_runner
    pushed = commit
    write('assets/sample/manifest.json', "later asset\n")
    commit
    write('assets/sample/manifest.json', "dirty asset\n")
    output, status = push(pushed, 'refs/heads/assets')
    assert status.success?, output
    assert_equal 1, records.length
    assert_equal 'committed asset', records.first.fetch('asset')
    assert_equal "dirty asset\n", File.read(File.join(@repo, 'assets/sample/manifest.json'))
  end

  # A snapshot nested under .git lets build tools discover the original repository.
  def test_snapshot_cannot_discover_the_original_git_repository
    add_runner
    oid = commit
    output, status = push(oid, 'refs/heads/isolated')
    assert status.success?, output
    refute records.first.fetch('git_discovered'), 'The full runner must not discover original Git metadata'
    refute records.first.fetch('git_work_tree'), 'The full runner must not resolve the original worktree'
    refute File.exist?(records.first.fetch('snapshot')), 'The owned system-temp snapshot is cleaned after success'
  end

  # Exported Git variables must not reconnect the child to the caller's checkout.
  def test_child_does_not_inherit_git_repository_environment
    add_runner
    oid = commit
    @env.merge!('GIT_DIR' => File.join(@repo, '.git'), 'GIT_WORK_TREE' => @repo,
                'GIT_INDEX_FILE' => File.join(@repo, '.git/index'),
                'GIT_OBJECT_DIRECTORY' => File.join(@repo, '.git/objects'),
                'TMPDIR' => File.join(@repo, '.git'))
    output, status = push(oid, 'refs/heads/environment-isolated')
    assert status.success?, output
    assert_equal oid, remote_ref('refs/heads/environment-isolated')
    assert_empty records.first.fetch('git_environment')
    refute records.first.fetch('git_discovered')
    assert_equal @repo, @env.fetch('GIT_WORK_TREE'), 'The caller environment stays intact'
    assert_equal File.join(@repo, '.git'), @env.fetch('TMPDIR'), 'The caller temporary directory stays intact'
    refute records.first.fetch('temporary_git_discovered'), 'Compiler temporary files cannot discover original Git metadata'
    assert_equal records.first.fetch('snapshot'), File.dirname(records.first.fetch('temporary_directory'))
    assert records.first.fetch('temporary_exists'), 'The child temporary directory exists during validation'
  end

  # Git replacement trees must not change the bytes validated for an original OID.
  def test_replacement_objects_cannot_substitute_the_pushed_snapshot
    add_runner
    original = commit
    write('native-ios/public.txt', "replacement source\n")
    write('assets/sample/manifest.json', "replacement asset\n")
    replacement = commit
    git('replace', original, replacement)
    output, status = push(original, 'refs/heads/original')
    assert status.success?, output
    assert_equal original, remote_ref('refs/heads/original')
    assert_equal ['committed', 'committed asset'], records.first.values_at('content', 'asset')
    assert_equal replacement, git('rev-parse', "refs/replace/#{original}").strip
  end

  # A commit without the required resource subtree cannot receive a PASS.
  def test_missing_committed_assets_block_push
    add_runner
    git('add', '.')
    git('rm', '-r', '--quiet', '--cached', 'assets')
    git('commit', '--quiet', '-m', 'Fixture without native assets')
    oid = git('rev-parse', 'HEAD').strip
    output, status = push(oid, 'refs/heads/missing-assets')
    refute status.success?, output
    refute remote_ref('refs/heads/missing-assets')
    assert_equal [], records
  end

  # Re-running an identical successful revision needlessly repeats heavy tests.
  def test_pass_cache_reuses_only_exact_commit_and_toolchain
    add_runner
    first = commit
    assert push(first, 'refs/heads/one').last.success?
    assert push(first, 'refs/heads/two').last.success?
    assert_equal 1, records.length
    stub_tool('xcodebuild', "#!/bin/sh\nprintf 'Xcode 27.0\\nBuild version 27A2\\n'\n")
    assert push(first, 'refs/heads/three').last.success?
    assert_equal 2, records.length
    write('native-ios/public.txt', "changed\n")
    second = commit
    assert push(second, 'refs/heads/four').last.success?
    assert_equal %w[committed committed changed], records.map { |record| record.fetch('content') }
  end

  # Older committed runners cannot earn the stronger gate's evidence, even if
  # an existing cache record claims the current contract for that exact commit.
  def test_old_or_ambiguous_committed_contract_is_rejected_before_cache_or_runner
    [nil, '3', '4\n# NATIVE_FULL_CONTRACT_VERSION=4'].each_with_index do |marker, index|
      add_runner
      path = File.join(@repo, 'native-ios/scripts/test-native-full.sh')
      source = File.read(path).sub("# NATIVE_FULL_CONTRACT_VERSION=4\n", '')
      source = source.sub("#!/bin/bash\n", "#!/bin/bash\n# NATIVE_FULL_CONTRACT_VERSION=#{marker.gsub('\\n', "\n")}\n") if marker
      File.write(path, source)
      oid = commit
      identity = { 'contract_version' => 4, 'commit' => oid,
                   'toolchain' => ["Xcode 27.0\nBuild version 27A1", 'Version: 2.46.0'],
                   'simulator' => '11111111-1111-4111-8111-111111111111',
                   'runtime' => 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' }
      evidence = File.join(@repo, '.git/native-pre-push')
      FileUtils.mkdir_p(evidence)
      File.write(File.join(evidence, "pass-#{Digest::SHA256.hexdigest(JSON.generate(identity))}.json"), JSON.generate(identity))
      output, status = push(oid, "refs/heads/old-contract-#{index}")
      refute status.success?, output
      refute remote_ref("refs/heads/old-contract-#{index}")
      assert_empty records
      assert_match(/contract/, output)
    end
  end

  def test_old_contract_cache_cannot_replace_a_new_contract_pass
    add_runner
    oid = commit
    assert push(oid, 'refs/heads/first').last.success?
    cache = Dir.glob(File.join(@repo, '.git/native-pre-push/pass-*.json')).fetch(0)
    identity = JSON.parse(File.read(cache))
    assert_equal 4, identity.fetch('contract_version')
    identity['contract_version'] = 3
    File.delete(cache)
    old_key = Digest::SHA256.hexdigest(JSON.generate(identity))
    File.write(File.join(File.dirname(cache), "pass-#{old_key}.json"), JSON.generate(identity))
    assert push(oid, 'refs/heads/new-contract').last.success?
    assert_equal 2, records.length
    assert push(oid, 'refs/heads/reuse-new-contract').last.success?
    assert_equal 2, records.length
  end

  # A failed test must block the real remote update and cannot seed a PASS cache.
  def test_failed_validation_blocks_push_and_is_never_reused
    add_runner
    oid = commit
    @env['NATIVE_TEST_FAILURE'] = '23'
    refute push(oid, 'refs/heads/dev').last.success?
    refute remote_ref('refs/heads/dev')
    @env['NATIVE_TEST_FAILURE'] = '0'
    assert push(oid, 'refs/heads/dev').last.success?
    assert_equal 2, records.length
  end

  # A second process must not run full tests or remove another process's lock.
  def test_existing_repository_lock_blocks_validation_and_is_preserved
    add_runner
    oid = commit
    lock = File.join(@repo, '.git/native-pre-push/lock')
    FileUtils.mkdir_p(lock)
    File.write(File.join(lock, 'owner'), 'another process')
    output, status = push(oid, 'refs/heads/dev')
    refute status.success?, output
    assert_equal [], records
    assert_equal 'another process', File.read(File.join(lock, 'owner'))
    assert_match(/lock/i, output)
  end

  # Invalid stdin must fail instead of appearing to be a deletion or empty push.
  def test_malformed_and_non_commit_input_is_rejected
    add_runner
    oid = commit
    blob = git('rev-parse', "#{oid}:native-ios/public.txt").strip
    ["\n", "refs/heads/dev #{oid}\n", "refs/heads/dev invalid refs/heads/dev #{ZERO}\n",
     "refs/heads/dev #{blob} refs/heads/dev #{ZERO}\n"].each do |input|
      output, status = hook(input)
      refute status.success?, output
    end
    assert_equal [], records
  end

  # Installing the hook must not silently replace another hook policy.
  def test_installer_preserves_conflicting_hook_configuration
    add_runner
    commit
    git('config', 'core.hooksPath', '/existing/custom/hooks')
    output, status = execute('bash', 'native-ios/scripts/install-native-git-hooks.sh')
    refute status.success?, output
    assert_equal '/existing/custom/hooks', git('config', '--local', '--get', 'core.hooksPath').strip
  end

  # An active default hook is user-owned even when hooksPath is unset.
  def test_installer_preserves_active_default_hook
    add_runner
    commit
    git('config', '--unset', 'core.hooksPath')
    custom = File.join(@repo, '.git/hooks/pre-commit')
    File.write(custom, "#!/bin/sh\nexit 0\n")
    FileUtils.chmod(0o755, custom)
    output, status = execute('bash', 'native-ios/scripts/install-native-git-hooks.sh')
    refute status.success?, output
    refute execute('git', 'config', '--get', 'core.hooksPath').last.success?
    assert_equal "#!/bin/sh\nexit 0\n", File.read(custom)
  end

  # An absent or non-executable installed hook would leave Git pushes unguarded.
  def test_installer_is_local_and_idempotent_then_hook_blocks_push
    add_runner
    oid = commit
    git('config', '--unset', 'core.hooksPath')
    FileUtils.chmod(0o644, File.join(@repo, '.githooks/pre-push'))
    2.times do
      output, status = execute('bash', 'native-ios/scripts/install-native-git-hooks.sh',
                               '--simulator-id', '11111111-1111-4111-8111-111111111111')
      assert status.success?, output
    end
    assert_equal '.githooks', git('config', '--local', '--get', 'core.hooksPath').strip
    refute File.exist?(@env.fetch('GIT_CONFIG_GLOBAL'))
    @env['NATIVE_TEST_FAILURE'] = '5'
    refute push(oid, 'refs/heads/dev').last.success?
    refute remote_ref('refs/heads/dev')
  end

  # A malformed tracked runner or tracked private configuration cannot be safe evidence.
  def test_tracked_private_configuration_is_rejected_before_runner
    add_runner
    write('native-ios/Config/Local.xcconfig', "private local fixture\n")
    oid = commit
    output, status = push(oid, 'refs/heads/dev')
    refute status.success?, output
    assert_equal [], records
    refute remote_ref('refs/heads/dev')
  end

  # A symlink runner must not read or execute files outside the commit snapshot.
  def test_runner_symlink_cannot_execute_external_file
    outside = File.join(@temporary, 'external-runner.sh')
    File.write(outside, "#!/bin/sh\nexit 0\n")
    path = File.join(@repo, 'native-ios/scripts/test-native-full.sh')
    FileUtils.mkdir_p(File.dirname(path))
    File.symlink(outside, path)
    oid = commit
    output, status = push(oid, 'refs/heads/dev')
    refute status.success?, output
    refute remote_ref('refs/heads/dev')
  end

  # Raw runner diagnostics and hook arguments may contain private data.
  def test_hook_output_keeps_private_runner_diagnostics_local
    add_runner
    oid = commit
    @env['NATIVE_TEST_FAILURE'] = '4'
    @env['NATIVE_TEST_PRIVATE_OUTPUT'] = 'private-account-and-signed-url'
    output, status = hook("refs/heads/dev #{oid} refs/heads/dev #{ZERO}\n")
    refute status.success?
    refute_includes output, 'private-account-and-signed-url'
    refute_includes output, 'private-remote.invalid'
    refute_includes output, @repo
    assert_includes output, 'Native full: running all native tests.'
    ['Native full: inspecting Debug product.', 'Native full: building Release product.',
     'Native full: inspecting Release product.', 'Native full: building fictional downloader.',
     'Native full: checking runtime inspection guard.'].each { |phase| assert_includes output, phase }
    assert_includes output, 'PASS: 183 native test cases matched the selected inventory.'
    refute_includes output, 'Native full: private-account-and-signed-url'
    assert Dir.glob(File.join(@repo, '.git/native-pre-push/run-*/runner.log')).any? { |path| File.read(path).include?('private-account-and-signed-url') }
  end

  # A toolchain change requires a new pass; an unsupported runtime must not reuse it.
  def test_pass_cache_tracks_xcodegen_and_rejects_an_unsupported_runtime
    add_runner
    oid = commit
    assert push(oid, 'refs/heads/one').last.success?
    stub_tool('xcodegen', "#!/bin/sh\nprintf 'Version: 2.47.0\\n'\n")
    assert push(oid, 'refs/heads/two').last.success?
    stub_tool('xcrun', "#!/bin/sh\nprintf '%s\\n' '{\"devices\":{\"com.apple.CoreSimulator.SimRuntime.iOS-27-1\":[{\"udid\":\"11111111-1111-4111-8111-111111111111\",\"name\":\"MetaShadowing Native Pre-push Tests\",\"isAvailable\":true}]}}'\n")
    refute push(oid, 'refs/heads/three').last.success?
    assert_equal 2, records.length
    refute remote_ref('refs/heads/three')
  end

  # Releasing the lock while the heavy child survives allows concurrent native tests.
  def test_cancellation_reaps_heavy_process_before_releasing_lock
    ['Native full: building Release product.', 'Native full: building fictional downloader.',
     'Native full: checking runtime inspection guard.'].each do |phase|
      assert_cancellation_drains_owned_build_processes(phase)
    end
  end

  def assert_cancellation_drains_owned_build_processes(phase)
    FileUtils.rm_f(@record)
    @env['NATIVE_TEST_BLOCK_PHASE'] = phase
    write('native-ios/public.txt', "#{phase}\n")
    write('native-ios/scripts/test-native-full.sh', <<~'SH')
      #!/bin/sh
      # NATIVE_FULL_CONTRACT_VERSION=4
      echo "$NATIVE_TEST_BLOCK_PHASE"
      exec ruby -rjson -e 'child = fork { sleep 60 }; trap("TERM") { Process.wait(child); exit 1 }; File.write(ENV.fetch("NATIVE_TEST_RECORD"), JSON.generate({pids: [Process.pid, child], snapshot: Dir.pwd})); sleep 60'
    SH
    oid = commit
    input_read, input_write = IO.pipe
    output = File.open(File.join(@temporary, 'cancel-output'), 'w')
    hook_pid = Process.spawn(@env, 'sh', '.githooks/pre-push', 'origin', 'private-remote.invalid',
                             chdir: @repo, in: input_read, out: output, err: output)
    input_read.close
    input_write.write("refs/heads/dev #{oid} refs/heads/dev #{ZERO}\n")
    input_write.close
    Timeout.timeout(5) { sleep 0.02 until File.exist?(@record) }
    active = JSON.parse(File.read(@record))
    heavy_pids = active.fetch('pids')
    concurrent_output, concurrent_status = hook("refs/heads/dev #{oid} refs/heads/dev #{ZERO}\n")
    refute concurrent_status.success?, concurrent_output
    assert File.directory?(File.join(@repo, '.git/native-pre-push/lock'))
    Process.kill('TERM', hook_pid)
    _pid, status = Timeout.timeout(5) { Process.wait2(hook_pid) }
    refute status.success?
    heavy_pids.each do |pid|
      refute process_alive?(pid), 'The heavy native process and descendants must stop before the hook releases its lock'
    end
    refute File.exist?(File.join(@repo, '.git/native-pre-push/lock'))
    refute File.exist?(active.fetch('snapshot')), 'Cancellation cleans the snapshot before releasing its lock'
    assert_empty Dir.glob(File.join(@repo, '.git/native-pre-push/pass-*.json'))
  ensure
    [*heavy_pids, hook_pid].compact.each do |pid|
      Process.kill('KILL', pid) if process_alive?(pid)
    rescue Errno::ESRCH
      nil
    end
    begin
      Process.wait(hook_pid) if hook_pid
    rescue Errno::ECHILD
      nil
    end
    [input_read, input_write, output].compact.each { |io| io.close unless io.closed? }
  end

  # Each distinct commit in a multi-ref push requires its own validation.
  def test_multi_ref_push_validates_unique_commits_and_annotated_tag
    add_runner
    first = commit
    git('tag', '-a', 'release-test', '-m', 'Synthetic annotated tag')
    tag = git('rev-parse', 'release-test').strip
    write('native-ios/public.txt', "second\n")
    second = commit
    output, status = execute('git', 'push', 'origin', "#{first}:refs/heads/one", "#{first}:refs/heads/two",
                             "#{second}:refs/heads/three", "#{tag}:refs/tags/release-test")
    assert status.success?, output
    assert_equal %w[committed second], records.map { |record| record.fetch('content') }
    assert_equal first, remote_ref('refs/heads/one')
    assert_equal second, remote_ref('refs/heads/three')
    assert_equal tag, remote_ref('refs/tags/release-test')
  end

  # Deletions require no native validation and must work without local tools/config.
  def test_real_branch_deletion_ignores_missing_native_configuration
    add_runner
    oid = commit
    assert push(oid, 'refs/heads/delete-me').last.success?
    git('config', '--unset', 'native.prePushSimulator')
    output, status = execute('git', 'push', 'origin', ':refs/heads/delete-me')
    assert status.success?, output
    refute remote_ref('refs/heads/delete-me')
    assert_equal 1, records.length
  end

  # Missing tools, absent settings and a reference simulator cannot bypass validation.
  def test_missing_tools_configuration_and_wrong_simulator_block_push
    add_runner
    oid = commit
    stub_tool('xcodebuild', "#!/bin/sh\nexit 127\n")
    refute push(oid, 'refs/heads/dev').last.success?
    stub_tool('xcodebuild', "#!/bin/sh\nprintf 'Xcode 27.0\\nBuild version 27A1\\n'\n")
    git('config', '--unset', 'native.prePushSimulator')
    refute push(oid, 'refs/heads/dev').last.success?
    git('config', 'native.prePushSimulator', '11111111-1111-4111-8111-111111111111')
    stub_tool('xcrun', "#!/bin/sh\nprintf '%s\\n' '{\"devices\":{\"com.apple.CoreSimulator.SimRuntime.iOS-27-0\":[{\"udid\":\"11111111-1111-4111-8111-111111111111\",\"name\":\"MetaShadowing Native W2\",\"isAvailable\":true}]}}'\n")
    refute push(oid, 'refs/heads/dev').last.success?
    assert_equal [], records
    refute remote_ref('refs/heads/dev')
  end

  private

  def process_alive?(pid)
    Process.kill(0, pid)
    true
  rescue Errno::ESRCH
    false
  end

  def add_runner
    write('native-ios/scripts/test-native-full.sh', <<~'SH')
      #!/bin/bash
      # NATIVE_FULL_CONTRACT_VERSION=4
      set -eu
      test "$1" = --simulator-id
      test "$2" = 11111111-1111-4111-8111-111111111111
      test "$3" = --output-dir
      test -d "$4"
      case "$4" in /*) ;; *) exit 91 ;; esac
      ruby -rjson -ropen3 - "$4" <<'RUBY'
      _output, status = Open3.capture2e('git', 'rev-parse', '--absolute-git-dir')
      _output, work_tree_status = Open3.capture2e('git', 'rev-parse', '--show-toplevel')
      temporary_directory = ENV.fetch('TMPDIR', '/tmp')
      _output, temporary_git_status = Open3.capture2e('git', '-C', temporary_directory, 'rev-parse', '--absolute-git-dir')
      File.open(ENV.fetch('NATIVE_TEST_RECORD'), 'a') do |file|
        file.puts JSON.generate({
          content: File.read('native-ios/public.txt').strip,
          asset: File.exist?('assets/sample/manifest.json') ? File.read('assets/sample/manifest.json').strip : nil,
          private: File.exist?('native-ios/Config/Local.xcconfig'),
          output_exists: File.directory?(ARGV[0]),
          git_discovered: status.success?,
          git_work_tree: work_tree_status.success?,
          snapshot: Dir.pwd,
          temporary_directory: temporary_directory,
          temporary_exists: File.directory?(temporary_directory),
          temporary_git_discovered: temporary_git_status.success?,
          git_environment: ENV.keys.grep(/\AGIT_/)
        })
      end
      RUBY
      echo "${NATIVE_TEST_PRIVATE_OUTPUT:-}"
      echo 'Native full: inspecting Debug product.'
      echo 'Native full: building Release product.'
      echo 'Native full: inspecting Release product.'
      echo 'Native full: building fictional downloader.'
      echo 'Native full: checking runtime inspection guard.'
      echo 'Native full: running all native tests.'
      echo 'PASS: 183 native test cases matched the selected inventory.'
      echo 'Native full: private-account-and-signed-url'
      exit "${NATIVE_TEST_FAILURE:-0}"
    SH
  end

  def records
    File.exist?(@record) ? File.readlines(@record).map { |line| JSON.parse(line) } : []
  end

  def write(relative, content)
    path = File.join(@repo, relative)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, content)
  end

  def stub_tool(name, content)
    path = File.join(@bin, name)
    File.write(path, content)
    FileUtils.chmod(0o755, path)
  end

  def commit
    git('add', '.')
    git('commit', '--quiet', '-m', 'Synthetic hook fixture')
    git('rev-parse', 'HEAD').strip
  end

  def git(*arguments)
    output, status = execute('git', *arguments)
    assert status.success?, output
    output
  end

  def execute(*arguments, input: '')
    Open3.capture2e(@env, *arguments, chdir: @repo, stdin_data: input)
  end

  def push(oid, remote)
    execute('git', 'push', 'origin', "#{oid}:#{remote}")
  end

  def hook(input)
    execute('sh', '.githooks/pre-push', 'origin', 'private-remote.invalid', input: input)
  end

  def remote_ref(ref)
    output, status = execute('git', '--git-dir', @remote, 'rev-parse', '--verify', ref)
    status.success? ? output.strip : nil
  end
end
