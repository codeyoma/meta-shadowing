const { withInfoPlist, withXcodeProject } = require('expo/config-plugins');

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
