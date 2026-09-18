const { withInfoPlist, withXcodeProject, withPodfile, withAppDelegate } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// Expo 57.0.23 supplies the scene delegate, but its SDK 57 bare template still
// starts RN from AppDelegate. Keep this migration in prebuild, not ignored ios/.
function adoptSceneLifecycle(source) {
  const legacyDeclaration = 'class AppDelegate: ExpoAppDelegate {';
  const sceneDeclaration = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
  const legacyWindow = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen.main.bounds\)\s+factory.startReactNative\(\s+withModuleName: "main",\s+in: window,\s+launchOptions: launchOptions\)\s+#endif/;
  if (source.includes(sceneDeclaration) && !source.includes('factory.startReactNative(')) return source;
  if (!source.includes(legacyDeclaration) || !legacyWindow.test(source)) {
    throw new Error('AppDelegate template changed; review the Expo scene lifecycle migration.');
  }
  return source.replace(legacyDeclaration, sceneDeclaration).replace(legacyWindow,
    '// ExpoAppSceneDelegate creates the scene window and starts React Native.');
}

module.exports = function withIosBuildSettings(config) {
  config = withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('Scene lifecycle requires the Swift AppDelegate.');
    mod.modResults.contents = adoptSceneLifecycle(mod.modResults.contents);
    return mod;
  });
  config = withInfoPlist(config, mod => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
        }],
      },
    };
    // iOS 26 deprecates this iPad-only key. Absence preserves the default false
    // behavior on our iPhone-only target; do not override explicit iPad policy.
    if (!mod.ios?.supportsTablet && !mod.ios?.isTabletOnly &&
        !mod.ios?.requireFullScreen && Number.parseFloat(mod.ios?.deploymentTarget) >= 26 &&
        mod.modResults.UIRequiresFullScreen === false) {
      delete mod.modResults.UIRequiresFullScreen;
    }
    return mod;
  });
  config = withPodfile(config, mod => {
    mod.modResults.contents = mergeContents({
      src: mod.modResults.contents,
      tag: 'sqlite-textual-c-headers',
      anchor: /^\s*post_install do \|installer\|\s*$/,
      offset: 1,
      comment: '#',
      newSrc: `    # SQLite's C macros conflict with Clang's imported Darwin module macros.
    # Keep normal warnings enabled and use textual headers for this C file only.
    sqlite_sources = installer.pods_project.targets
      .select { |target| target.name == 'ExpoSQLite' }
      .flat_map { |target| target.source_build_phase.files }
      .select { |file| file.file_ref && file.file_ref.real_path.basename.to_s == 'sqlite3.c' }
    raise 'Expected exactly one ExpoSQLite amalgamation source' unless sqlite_sources.length == 1
    sqlite_sources.each do |file|
      file.settings ||= {}
      flags = file.settings['COMPILER_FLAGS'].to_s
      file.settings['COMPILER_FLAGS'] = "#{flags} -fno-modules".strip unless flags.split.include?('-fno-modules')
    end`,
    }).contents;
    return mod;
  });
  return withXcodeProject(config, mod => {
    const project = mod.modResults;
    for (const target of Object.values(project.pbxNativeTargetSection())) {
      if (typeof target !== 'object' || target.productType?.replaceAll('"', '') !== 'com.apple.product-type.application') continue;
      const configurations = project.pbxXCConfigurationList()[target.buildConfigurationList].buildConfigurations;
      for (const reference of configurations) {
        Object.assign(project.pbxXCBuildConfigurationSection()[reference.value].buildSettings, {
          HERMES_GLOBALS_FILE: '"$(PROJECT_DIR)/../scripts/hermes-globals.js"',
          HERMES_ALLOW_GLOBAL_EVAL: '1',
        });
      }
    }
    return mod;
  });
};

module.exports.adoptSceneLifecycle = adoptSceneLifecycle;
