#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
xcodebuild() { printf '%s\n' "${CI_PRODUCT_TOOLCHAIN:-Xcode 27.0}"; }
export -f xcodebuild
ruby -rfileutils -rtmpdir -ropen3 -e '
  script = File.expand_path("native-ios/scripts/ci-test-products.sh")
  Dir.mktmpdir("native-products-test") do |root|
    build = File.join(root, "build")
    products = File.join(build, "NativeTests.xctestproducts")
    app = File.join(products, "Binaries/0/Debug-iphonesimulator/MetaShadowingNative.app")
    tests = File.join(products, "Tests/0")
    FileUtils.mkdir_p([app, tests])
    File.write(File.join(products, "Info.plist"), "fixture")
    File.write(File.join(tests, "MetaShadowingNative.xctestrun"), "fixture")
    executable = File.join(app, "MetaShadowingNative")
    File.write(executable, "synthetic executable")
    File.chmod(0755, executable)
    File.symlink("../../Binaries/0/Debug-iphonesimulator", File.join(tests, "Debug-iphonesimulator"))
    archive = File.join(root, "products.tar")
    env = {"GITHUB_SHA" => "a" * 40, "CI_PRODUCT_TOOLCHAIN" => "Xcode 27.0"}
    run = ->(args, expected, overrides = {}) {
      output, status = Open3.capture2e(env.merge(overrides), "bash", script, *args)
      abort "FAIL: #{args.first}: #{output}" unless status.success? == expected
    }
    run.call(["pack", build, archive], true)
    restored = File.join(root, "relocated")
    run.call(["unpack", archive, restored], true)
    restored_app = File.join(restored, "NativeTests.xctestproducts/Binaries/0/Debug-iphonesimulator/MetaShadowingNative.app/MetaShadowingNative")
    abort "FAIL: executable changed" unless File.read(restored_app) == "synthetic executable" && File.executable?(restored_app)
    link = File.join(restored, "NativeTests.xctestproducts/Tests/0/Debug-iphonesimulator")
    abort "FAIL: portable internal link lost" unless File.symlink?(link) && File.directory?(link)
    run.call(["unpack", archive, restored], false)
    run.call(["unpack", archive, File.join(root, "wrong-commit")], false, "GITHUB_SHA" => "b" * 40)
    run.call(["unpack", archive, File.join(root, "wrong-toolchain")], false, "CI_PRODUCT_TOOLCHAIN" => "Xcode 26.0")
    abort "FAIL: incompatible products extracted" if File.exist?(File.join(root, "wrong-commit")) || File.exist?(File.join(root, "wrong-toolchain"))
    run.call(["pack", build, File.join(root, "no-revision.tar")], false, "GITHUB_SHA" => "")
    FileUtils.rm(File.join(products, "Info.plist"))
    run.call(["pack", build, File.join(root, "missing.tar")], false)
    corrupt = File.join(root, "corrupt.tar")
    File.write(corrupt, "not an archive")
    run.call(["unpack", corrupt, File.join(root, "corrupt")], false)
    stage = File.join(root, "tampered"); FileUtils.mkdir_p(stage)
    _, status = Open3.capture2e("tar", "-xf", archive, "-C", stage)
    abort "FAIL: test fixture extraction" unless status.success?
    File.open(File.join(stage, "products.tar.gz"), "a") { |f| f.write("damage") }
    tampered = File.join(root, "tampered.tar")
    _, status = Open3.capture2e("tar", "-cf", tampered, "-C", stage, "metadata.json", "products.tar.gz")
    abort "FAIL: test fixture archive" unless status.success?
    run.call(["unpack", tampered, File.join(root, "damaged")], false)
  end
  puts "PASS: portable products preserve executables and links and reject missing, incompatible or damaged artifacts."
'
