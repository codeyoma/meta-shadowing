const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('prebuild adds the wordmark at the same screen-relative bottom offset as the animated launch', async t => {
  const { getPrebuildConfigAsync } = require('@expo/prebuild-config');
  const { compileModsAsync } = require('@expo/config-plugins');
  const root = mkdtempSync(path.join(tmpdir(), 'ios-launch-wordmark-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { exp } = await getPrebuildConfigAsync(process.cwd(), { platforms: ['ios'] });
  const compiled = await compileModsAsync(exp, { projectRoot: root, platforms: ['ios'], introspect: true });
  const storyboard = compiled._internal.modResults.ios.splashScreenStoryboard;
  const view = storyboard.document.scenes[0].scene[0].objects[0].viewController[0].view[0];
  const images = view.subviews[0].imageView;
  assert.equal(images.filter(image => image.$.image === 'LaunchWordmark').length, 1);
  const puppy = images.find(image => image.$.image === 'SplashScreenLogo');
  assert.ok(puppy);
  assert.equal(Number(puppy.rect[0].$.width), 160, 'The native still and animated puppy must share the smaller display size');
  assert.equal(Number(puppy.rect[0].$.height), 160);
  const puppyResource = storyboard.document.resources[0].image.find(image => image.$.name === 'SplashScreenLogo');
  assert.equal(Number(puppyResource.$.width), 160, 'The native image intrinsic size must not jump at handoff');
  assert.equal(Number(puppyResource.$.height), 160);
  const constraints = view.constraints[0].constraint.map(constraint => constraint.$);
  for (const attribute of ['centerX', 'centerY']) {
    assert.ok(constraints.some(c => c.firstItem === puppy.$.id && c.firstAttribute === attribute && c.secondItem === view.$.id));
  }
  const footer = images.find(image => image.$.image === 'LaunchWordmark');
  const footerConstraints = constraints.filter(c => c.firstItem === footer.$.id);
  assert.equal(footer.$.contentMode, 'scaleAspectFit');
  assert.ok(footerConstraints.some(c => c.firstAttribute === 'width' && Number(c.constant) === 220));
  assert.ok(footerConstraints.some(c => c.firstAttribute === 'height' && Number(c.constant) === 220 * 2 / 3));
  assert.ok(footerConstraints.some(c => c.firstAttribute === 'centerX' && c.secondItem === view.$.id));
  assert.ok(footerConstraints.some(c => c.firstAttribute === 'bottom' && c.secondItem === view.$.id && Number(c.constant) === -58),
    'Expo temporarily hosts the storyboard without a view controller safe area; use the same screen-relative coordinate as React Native');
  const before = JSON.stringify(storyboard);
  const plugin = require('../plugins/with-launch-wordmark')({});
  const reapplied = await plugin.mods.ios.splashScreenStoryboard({ modResults: storyboard, modRequest: {} });
  assert.equal(JSON.stringify(reapplied.modResults), before, 'Repeated prebuilds must not duplicate the footer or its constraints');
});

test('launch wordmark asset generation preserves the supplied PNG bytes and is repeatable', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'ios-launch-wordmark-asset-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plugin = require('../plugins/with-launch-wordmark')({});
  for (let i = 0; i < 2; i++) {
    await plugin.mods.ios.dangerous({ modRequest: { projectRoot: process.cwd(), platformProjectRoot: root, projectName: 'app' } });
  }
  const directory = path.join(root, 'app/Images.xcassets/LaunchWordmark.imageset');
  const contents = JSON.parse(readFileSync(path.join(directory, 'Contents.json'), 'utf8'));
  assert.equal(contents.images.length, 1);
  assert.deepEqual(readFileSync(path.join(directory, contents.images[0].filename)), readFileSync('assets/brand/launch-wordmark.png'));
});

test('prebuild permits user-enabled voice monitoring to continue with the screen locked', async t => {
  const { getPrebuildConfigAsync } = require('@expo/prebuild-config');
  const { compileModsAsync } = require('@expo/config-plugins');
  const { exp } = await getPrebuildConfigAsync(process.cwd(), { platforms: ['ios'] });
  const root = mkdtempSync(path.join(tmpdir(), 'ios-monitor-background-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const compiled = await compileModsAsync(exp, { projectRoot: root, platforms: ['ios'], introspect: true });
  const plist = compiled._internal.modResults.ios.infoPlist;
  assert.ok(plist.UIBackgroundModes?.includes('audio'));
  assert.ok(plist.NSMicrophoneUsageDescription);
});

// Exercise the actual RN bundling script and installed Hermes compiler. Only
// Metro's bundle emission is replaced with a tiny controlled source fixture.
function bundle(t, source, extraEnv = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'ios-bundle-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'app'));
  writeFileSync(path.join(root, 'entry.js'), '"use strict";\n' + source);
  writeFileSync(path.join(root, 'emit.cjs'), `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.copyFileSync(args[args.indexOf('--entry-file') + 1], args[args.indexOf('--bundle-output') + 1]);
    fs.writeFileSync(process.env.ARGUMENTS_FILE, JSON.stringify(args));
  `);
  const hermes = path.join(path.dirname(require.resolve('hermes-compiler/package.json')), 'hermesc',
    process.platform === 'darwin' ? 'osx-bin' : 'linux64-bin', 'hermesc');
  const script = path.join(path.dirname(require.resolve('react-native/package.json')), 'scripts/react-native-xcode.sh');
  const env = { PATH: process.env.PATH, NODE_BINARY: process.execPath, CLI_PATH: path.join(root, 'emit.cjs'),
    PROJECT_ROOT: root, PROJECT_DIR: root, CONFIGURATION: 'Release', PLATFORM_NAME: 'iphonesimulator',
    CONFIGURATION_BUILD_DIR: root, UNLOCALIZED_RESOURCES_FOLDER_PATH: 'app', PODS_ROOT: root,
    ENTRY_FILE: path.join(root, 'entry.js'), ARGUMENTS_FILE: path.join(root, 'args.json'),
    HERMES_CLI_PATH: hermes, HERMES_GLOBALS_FILE: path.join(__dirname, 'hermes-globals.js'),
    HERMES_ALLOW_GLOBAL_EVAL: '1', ...extraEnv };
  const result = spawnSync('bash', [script], { env, encoding: 'utf8' });
  const diagnostics = result.stderr.split('\n').filter(line => /: (warning|error):/.test(line));
  return { ...result, diagnostics, root, args: JSON.parse(readFileSync(path.join(root, 'args.json'), 'utf8')) };
}

test('runtime declarations and intentional global eval compile without false diagnostics', t => {
  const result = bundle(t, 'globalThis.answer = Promise.resolve(eval("1"));');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(readFileSync(path.join(result.root, 'app/main.jsbundle')).subarray(0, 8).toString('hex'), 'c61fbc03c103191f');
});

test('unknown globals and syntax errors stay visible to the build', t => {
  const unknown = bundle(t, 'globalThis.answer = misspelledApplicationGlobal;');
  assert.equal(unknown.status, 0);
  assert.ok(unknown.diagnostics.some(line => line.includes('misspelledApplicationGlobal')));
  const invalid = bundle(t, 'const = ;');
  assert.notEqual(invalid.status, 0);
  assert.ok(invalid.diagnostics.some(line => line.includes('error:')));
});

test('global eval suppression is opt-in; unconfigured builds retain the diagnostic', t => {
  const result = bundle(t, 'globalThis.answer = eval("1");', { HERMES_ALLOW_GLOBAL_EVAL: '' });
  assert.equal(result.status, 0);
  assert.ok(result.diagnostics.some(line => /direct.*eval/i.test(line)), result.diagnostics.join('\n'));
});

test('normal builds reuse Metro cache, while explicit reset remains available', t => {
  assert.equal(bundle(t, 'globalThis.answer = 1;').args.includes('--reset-cache'), false);
  assert.equal(bundle(t, 'globalThis.answer = 1;', { RESET_METRO_CACHE: '1' }).args.includes('--reset-cache'), true);
});

test('iPhone prebuild omits the obsolete iPad fullscreen flag without changing supported orientations', async t => {
  const { getPrebuildConfigAsync } = require('@expo/prebuild-config');
  const { compileModsAsync } = require('@expo/config-plugins');
  const { exp } = await getPrebuildConfigAsync(process.cwd(), { platforms: ['ios'] });
  const root = mkdtempSync(path.join(tmpdir(), 'ios-config-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const compiled = await compileModsAsync(exp, { projectRoot: root, platforms: ['ios'], introspect: true });
  const plist = compiled._internal.modResults.ios.infoPlist;
  assert.equal(Object.hasOwn(plist, 'UIRequiresFullScreen'), false);
  assert.ok(plist.UISupportedInterfaceOrientations.includes('UIInterfaceOrientationPortrait'));
  assert.ok(plist.UISupportedInterfaceOrientations.includes('UIInterfaceOrientationLandscapeLeft'));
});

test('prebuild preserves explicit fullscreen and tablet policy', async t => {
  const { getPrebuildConfigAsync } = require('@expo/prebuild-config');
  const { compileModsAsync } = require('@expo/config-plugins');
  for (const policy of [{ requireFullScreen: true }, { supportsTablet: true }, { isTabletOnly: true }]) {
    const { exp } = await getPrebuildConfigAsync(process.cwd(), { platforms: ['ios'] });
    Object.assign(exp.ios, policy);
    const root = mkdtempSync(path.join(tmpdir(), 'ios-config-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const compiled = await compileModsAsync(exp, { projectRoot: root, platforms: ['ios'], introspect: true });
    assert.equal(compiled._internal.modResults.ios.infoPlist.UIRequiresFullScreen, !!policy.requireFullScreen);
  }
});

test('iPhone prebuild registers a window scene so SDK 27 builds can launch', async t => {
  const { getPrebuildConfigAsync } = require('@expo/prebuild-config');
  const { compileModsAsync } = require('@expo/config-plugins');
  const { exp } = await getPrebuildConfigAsync(process.cwd(), { platforms: ['ios'] });
  const root = mkdtempSync(path.join(tmpdir(), 'ios-scene-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const compiled = await compileModsAsync(exp, { projectRoot: root, platforms: ['ios'], introspect: true });
  const scenes = compiled._internal.modResults.ios.infoPlist.UIApplicationSceneManifest;
  assert.ok(scenes, 'iOS 27 rejects this app without a scene manifest');
  const windows = scenes.UISceneConfigurations?.UIWindowSceneSessionRoleApplication;
  assert.equal(scenes.UIApplicationSupportsMultipleScenes, false);
  assert.equal(windows?.length, 1, 'The app needs exactly one window scene configuration');
  assert.equal(windows[0].UISceneDelegateClassName, 'EXExpoAppSceneDelegate');
});

test('scene migration delegates window creation to Expo and is repeatable', () => {
  const { adoptSceneLifecycle } = require('../plugins/with-ios-build-settings');
  const legacy = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  func start() {
    reactNativeFactory = factory
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}`;
  const migrated = adoptSceneLifecycle(legacy);
  assert.match(migrated, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert.doesNotMatch(migrated, /UIWindow\(frame:|factory.startReactNative/);
  assert.match(migrated, /reactNativeFactory = factory/);
  assert.match(migrated, /super.application/);
  assert.equal(adoptSceneLifecycle(migrated), migrated);
  assert.throws(() => adoptSceneLifecycle('class DifferentDelegate {}'), /AppDelegate/);
});
