const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withProgressCloud(config, options) {
  const container = (options ? options.container : process.env.APPLE_CLOUDKIT_CONTAINER)?.trim();
  if (!container) return withInfoPlist(config, config => {
    delete config.modResults.ProgressCloudConfigured;
    delete config.modResults.ProgressCloudContainer;
    delete config.modResults.ProgressCloudEnvironment;
    return config;
  });
  if (!/^iCloud\.[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/.test(container) || container.length > 255) {
    throw new Error('Invalid APPLE_CLOUDKIT_CONTAINER');
  }
  const environment = (options ? options.environment : process.env.APPLE_CLOUDKIT_ENVIRONMENT) || 'Development';
  if (!['Development', 'Production'].includes(environment)) throw new Error('Invalid APPLE_CLOUDKIT_ENVIRONMENT');
  config = withEntitlementsPlist(config, config => {
    const entitlements = config.modResults;
    entitlements['com.apple.developer.icloud-container-identifiers'] = [...new Set([
      ...(entitlements['com.apple.developer.icloud-container-identifiers'] || []), container,
    ])];
    entitlements['com.apple.developer.icloud-services'] = [...new Set([
      ...(entitlements['com.apple.developer.icloud-services'] || []), 'CloudKit',
    ])];
    entitlements['com.apple.developer.icloud-container-environment'] = environment;
    entitlements['aps-environment'] = environment.toLowerCase();
    return config;
  });
  return withInfoPlist(config, config => {
    config.modResults.ProgressCloudConfigured = true;
    config.modResults.ProgressCloudContainer = container;
    config.modResults.ProgressCloudEnvironment = environment;
    config.modResults.UIBackgroundModes = [...new Set([...(config.modResults.UIBackgroundModes || []), 'remote-notification'])];
    return config;
  });
};
