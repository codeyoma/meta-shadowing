const { withDangerousMod, withMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const imageName = 'LaunchWordmark';
const viewId = 'APP-LaunchWordmark';
const width = 220;
const height = width * 2 / 3;

// Register before expo-splash-screen: its storyboard image mod executes first,
// then this mod appends the footer without replacing the centered puppy.
module.exports = function withLaunchWordmark(config) {
  config = withDangerousMod(config, ['ios', async config => {
    const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
    const directory = path.join(platformProjectRoot, projectName, 'Images.xcassets', `${imageName}.imageset`);
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(path.join(projectRoot, 'assets/brand/launch-wordmark.png'), path.join(directory, 'wordmark.png'));
    await fs.writeFile(path.join(directory, 'Contents.json'), JSON.stringify({
      images: [{ idiom: 'universal', filename: 'wordmark.png', scale: '1x' }],
      info: { version: 1, author: 'xcode' },
    }, null, 2) + '\n');
    return config;
  }]);

  return withMod(config, { platform: 'ios', mod: 'splashScreenStoryboard', action: config => {
    const document = config.modResults.document;
    const view = document.scenes[0].scene[0].objects[0].viewController[0].view[0];
    const images = view.subviews[0].imageView;
    view.subviews[0].imageView = images.filter(image => image.$.id !== viewId);
    view.subviews[0].imageView.push({
      $: { id: viewId, userLabel: imageName, image: imageName, contentMode: 'scaleAspectFit',
        clipsSubviews: 'YES', userInteractionEnabled: 'NO', translatesAutoresizingMaskIntoConstraints: 'NO' },
    });
    const constraints = view.constraints[0].constraint.filter(constraint => constraint.$.firstItem !== viewId && constraint.$.secondItem !== viewId);
    view.constraints[0].constraint = constraints.concat([
      { $: { id: `${viewId}-centerX`, firstItem: viewId, firstAttribute: 'centerX', secondItem: view.$.id, secondAttribute: 'centerX' } },
      // Expo's retained splash view can have a zero safe-area inset. A shared
      // screen-relative offset keeps the footer still through the JS handoff.
      { $: { id: `${viewId}-bottom`, firstItem: viewId, firstAttribute: 'bottom', secondItem: view.$.id, secondAttribute: 'bottom', constant: '-58' } },
      { $: { id: `${viewId}-width`, firstItem: viewId, firstAttribute: 'width', constant: String(width) } },
      { $: { id: `${viewId}-height`, firstItem: viewId, firstAttribute: 'height', constant: String(height) } },
    ]);
    const resources = document.resources[0];
    resources.image = resources.image.filter(image => image.$.name !== imageName);
    resources.image.push({ $: { name: imageName, width: '1536', height: '1024' } });
    return config;
  } });
};
