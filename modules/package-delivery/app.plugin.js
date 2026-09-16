const { withInfoPlist, withEntitlementsPlist, withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist');
const { configureFreeDuo } = require('../../scripts/free-duo.cjs');

const targetName = 'SampleDownloader';

module.exports = function withPackageDelivery(config) {
  const group = process.env.APPLE_ASSET_APP_GROUP?.trim();
  const assetPackID = process.env.APPLE_SAMPLE_ASSET_PACK_ID?.trim();
  const diagnostics = process.env.APPLE_DELIVERY_DIAGNOSTICS === '1';
  if (diagnostics && (!group || !assetPackID || assetPackID === 'delivery-diagnostic-v1')) {
    throw new Error('Diagnostics require separate configured sample delivery.');
  }
  config = withInfoPlist(config, mod => {
    configureFreeDuo(mod.modResults, process.env, mod.modRequest.projectRoot);
    const manifest = require('../../assets/sample/manifest.json');
    const specification = require('../../assets/sample/delivery.json');
    mod.modResults.SampleDescriptor = JSON.stringify({ key: specification.key, files: [specification.metadata,
      ...manifest.phrases.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 }))] });
    const previousGroup = mod.modResults.BAAppGroupID;
    // An incremental project can contain this plugin's old target/entitlements.
    // Never silently retain them after disabling delivery or changing its group.
    if ((previousGroup && previousGroup !== group) || (!group && mod.modResults.SampleAssetPackID)) {
      throw new Error('Apple delivery configuration changed. Regenerate with expo prebuild --clean --platform ios before building; do not use --no-clean.');
    }
    if (group && assetPackID) {
      Object.assign(mod.modResults, { BAAppGroupID: group, BAHasManagedAssetPacks: true, BAUsesAppleHosting: true, SampleAssetPackID: assetPackID });
    } else {
      for (const key of ['BAAppGroupID', 'BAHasManagedAssetPacks', 'BAUsesAppleHosting', 'SampleAssetPackID']) delete mod.modResults[key];
    }
    for (const key of ['DeliveryDiagnosticsEnabled', 'DiagnosticAssetPackID', 'DiagnosticDescriptor']) delete mod.modResults[key];
    if (diagnostics) {
      const manifest = require('../../assets/sample/manifest.json');
      const specification = require('../../assets/sample/delivery.json');
      Object.assign(mod.modResults, {
        DeliveryDiagnosticsEnabled: true,
        DiagnosticAssetPackID: 'delivery-diagnostic-v1',
        DiagnosticDescriptor: JSON.stringify({ key: 'delivery-diagnostic-v1', files: [specification.metadata,
          ...manifest.phrases.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 }))] }),
      });
    }
    return mod;
  });
  if (!group && !assetPackID) return config;
  if (!group || !/^group\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(group) || group.length > 255) {
    throw new Error('Set APPLE_ASSET_APP_GROUP to the registered shared App Group.');
  }
  if (!assetPackID || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(assetPackID)) {
    throw new Error('Set APPLE_SAMPLE_ASSET_PACK_ID to the controlled sample asset-pack identifier.');
  }
  const bundle = config.ios?.bundleIdentifier;
  if (!bundle) throw new Error('An iOS bundle identifier is required for sample delivery.');
  const entitlements = { 'com.apple.security.application-groups': [group] };
  config = withEntitlementsPlist(config, mod => {
    mod.modResults['com.apple.security.application-groups'] = [...new Set([
      ...(mod.modResults['com.apple.security.application-groups'] || []), group,
    ])];
    return mod;
  });
  config = withDangerousMod(config, ['ios', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, targetName);
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'extension', 'SampleDownloader.swift'), path.join(directory, 'SampleDownloader.swift'));
    fs.writeFileSync(path.join(directory, `${targetName}.entitlements`), plist.default.build(entitlements));
    fs.writeFileSync(path.join(directory, `${targetName}-Info.plist`), plist.default.build({
      CFBundleDisplayName: 'Sample Downloader', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundleName: '$(PRODUCT_NAME)', CFBundlePackageType: 'XPC!',
      CFBundleShortVersionString: config.version || '1.0', CFBundleVersion: config.ios?.buildNumber || '1',
      EXAppExtensionAttributes: { EXExtensionPointIdentifier: 'com.apple.background-asset-downloader-extension' },
    }));
    return mod;
  }]);
  return withXcodeProject(config, mod => {
    const project = mod.modResults;
    let target = Object.entries(project.pbxNativeTargetSection()).find(([, value]) =>
      typeof value === 'object' && value.name?.replaceAll('"', '') === targetName);
    if (!target) {
      const added = project.addTarget(targetName, 'app_extension', targetName, `${bundle}.${targetName}`);
      target = [added.uuid, added.pbxNativeTarget];
      project.addBuildPhase([`${targetName}/SampleDownloader.swift`], 'PBXSourcesBuildPhase', 'Sources', added.uuid);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', added.uuid);
    }
    // node-xcode only scaffolds legacy app extensions. Background Download is an
    // ExtensionKit target (Xcode's template) and must be embedded in Extensions,
    // not PlugIns. Preserve the app's other extension copy phases.
    target[1].productType = '"com.apple.product-type.extensionkit-extension"';
    const product = target[1].productReference;
    project.pbxFileReferenceSection()[product].explicitFileType = '"wrapper.extensionkit-extension"';
    const phases = project.hash.project.objects.PBXCopyFilesBuildPhase;
    for (const phase of Object.values(phases)) {
      if (typeof phase !== 'object') continue;
      const entries = phase.files.filter(entry => project.pbxBuildFileSection()[entry.value]?.fileRef === product);
      if (!entries.length) continue;
      let destination = phase;
      if (entries.length !== phase.files.length) {
        phase.files = phase.files.filter(entry => !entries.includes(entry));
        destination = project.addBuildPhase([], 'PBXCopyFilesBuildPhase', 'Embed Sample Downloader', project.getFirstTarget().uuid, 'application').buildPhase;
        destination.files = entries;
      }
      destination.dstSubfolderSpec = 16;
      destination.dstPath = '"$(EXTENSIONS_FOLDER_PATH)"';
    }
    const configurations = project.pbxXCConfigurationList()[target[1].buildConfigurationList].buildConfigurations;
    for (const reference of configurations) {
      Object.assign(project.pbxXCBuildConfigurationSection()[reference.value].buildSettings, {
        PRODUCT_BUNDLE_IDENTIFIER: `"${bundle}.${targetName}"`,
        INFOPLIST_FILE: `"${targetName}/${targetName}-Info.plist"`,
        CODE_SIGN_ENTITLEMENTS: `"${targetName}/${targetName}.entitlements"`,
        SWIFT_VERSION: '6.0', SWIFT_STRICT_CONCURRENCY: 'complete',
        IPHONEOS_DEPLOYMENT_TARGET: '26.0', TARGETED_DEVICE_FAMILY: '1',
        APPLICATION_EXTENSION_API_ONLY: 'YES', GENERATE_INFOPLIST_FILE: 'NO',
        MARKETING_VERSION: config.version || '1.0', CURRENT_PROJECT_VERSION: config.ios?.buildNumber || '1',
        CODE_SIGN_STYLE: 'Automatic', SDKROOT: 'iphoneos',
      });
    }
    return mod;
  });
};
