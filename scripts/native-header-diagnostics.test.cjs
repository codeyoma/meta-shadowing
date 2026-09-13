const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { existsSync, readdirSync } = require('node:fs');

// Compile the installed native headers, not copies of their implementation.
// Losing inline on these header helpers recreates Release unused-function errors.
const cases = [
  ['react-native-worklets/apple/worklets/apple/AssertJavaScriptQueue.h', 'AssertJavaScriptQueue();'],
  ['react-native-worklets/apple/worklets/apple/AssertTurboModuleManagerQueue.h', 'AssertTurboModuleManagerQueue();'],
  ['react-native-reanimated/apple/reanimated/apple/REAAssertJavaScriptQueue.h', 'REAAssertJavaScriptQueue();'],
  ['react-native-reanimated/apple/reanimated/apple/REAAssertTurboModuleManagerQueue.h', 'REAAssertTurboModuleManagerQueue();'],
  ['react-native-gesture-handler/apple/RNGHStylusData.h', ''],
];
for (const [header, call] of cases) {
  test(`Release header compiles without unused helper diagnostics: ${header}`, { skip: process.platform !== 'darwin' }, () => {
    const sdk = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
    assert.equal(sdk.status, 0, sdk.stderr);
    const result = spawnSync('xcrun', ['clang++', '-x', 'objective-c++', '-std=c++20', '-fsyntax-only',
      '-fmodules', '-DNDEBUG', '-target', 'arm64-apple-ios26.0-simulator', '-isysroot', sdk.stdout.trim(),
      '-I', path.resolve('node_modules/react-native/ReactCommon'), '-Werror=unused-function', '-'], {
      encoding: 'utf8', input: `#import <UIKit/UIKit.h>\n#include "${path.resolve('node_modules', header)}"\nvoid exercise() { ${call} }\n`,
    });
    assert.equal(result.status, 0, result.stderr);
  });
}

test('pan delay getter cannot collide with its delayed activation action', {
  skip: process.platform !== 'darwin' || !existsSync('ios/Pods/Headers/Public'),
}, () => {
  // Compile the real implementation: a void timer action sharing the CGFloat
  // getter's selector changes both the getter ABI and its side effects.
  const sdk = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
  assert.equal(sdk.status, 0, sdk.stderr);
  const headers = 'ios/Pods/Headers/Public';
  const includes = [headers, ...readdirSync(headers).map(name => path.join(headers, name)),
    'node_modules/react-native-gesture-handler/apple', 'node_modules/react-native/ReactCommon',
    'ios/build/generated/ios'];
  const result = spawnSync('xcrun', ['clang', '-x', 'objective-c', '-fsyntax-only', '-fobjc-arc',
    '-fmodules', '-target', 'arm64-apple-ios26.0-simulator', '-isysroot', sdk.stdout.trim(),
    ...includes.flatMap(directory => ['-I', path.resolve(directory)]), '-Werror=mismatched-return-types',
    path.resolve('node_modules/react-native-gesture-handler/apple/Handlers/RNPanHandler.m')],
  { encoding: 'utf8', maxBuffer: 5_000_000 });
  assert.equal(result.status, 0, result.stderr);
});

test('generated SQLite file policy fixes Darwin macro ambiguity without disabling the diagnostic', {
  skip: process.platform !== 'darwin' || !existsSync('ios/Pods/Pods.xcodeproj/project.pbxproj'),
}, () => {
  const project = require('xcode').project('ios/Pods/Pods.xcodeproj/project.pbxproj');
  project.parseSync();
  const sources = Object.values(project.pbxBuildFileSection()).filter(file => typeof file === 'object' &&
    project.pbxFileReferenceSection()[file.fileRef]?.path?.includes('sqlite3.c'));
  assert.equal(sources.length, 1);
  const flags = require('shell-quote').parse(sources[0].settings?.COMPILER_FLAGS || '');
  const sdk = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
  assert.equal(sdk.status, 0, sdk.stderr);
  function compile(fileFlags) {
    return spawnSync('xcrun', ['clang', '-x', 'c', '-fsyntax-only', '-fmodules',
      '-target', 'arm64-apple-ios26.0-simulator', '-isysroot', sdk.stdout.trim(), ...fileFlags,
      '-Werror=ambiguous-macro', path.resolve('node_modules/expo-sqlite/ios/sqlite3.c')],
    { encoding: 'utf8', maxBuffer: 5_000_000 });
  }
  const withoutPolicy = compile([]);
  assert.notEqual(withoutPolicy.status, 0);
  assert.match(withoutPolicy.stderr, /ambiguous expansion of macro/);
  const configured = compile(flags);
  assert.equal(configured.status, 0, configured.stderr);
});
