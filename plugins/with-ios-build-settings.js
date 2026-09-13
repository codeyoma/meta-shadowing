const { withInfoPlist, withXcodeProject, withPodfile } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

module.exports = function withIosBuildSettings(config) {
  config = withInfoPlist(config, mod => {
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
