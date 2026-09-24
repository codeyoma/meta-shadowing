const fs = require('node:fs');
const path = require('node:path');
function copyLocalVideo(root, product, configuration, enabled) {
  if (!root || !product || !fs.statSync(product).isDirectory()) throw Error('Invalid build destination.');
  const target = path.join(product, 'LocalVideo');
  // Exact, generated resource directory only. Never remove the product or source.
  fs.rmSync(target, { recursive: true, force: true });
  if (configuration !== 'Debug' || !enabled) return;
  const source = path.join(root, 'private/local-video');
  for (const relative of ['', 'video', 'manifest.json', 'video/source.mp4']) {
    if (fs.lstatSync(path.join(source, relative)).isSymbolicLink()) throw Error('Unsupported video source.');
  }
  fs.mkdirSync(path.join(target, 'video'), { recursive: true });
  try {
    for (const relative of ['manifest.json', 'video/source.mp4']) {
      fs.copyFileSync(path.join(source, relative), path.join(target, relative));
    }
  } catch {
    fs.rmSync(target, { recursive: true, force: true });
    throw Error('Local video resource copy failed.');
  }
}
module.exports = { copyLocalVideo };
if (require.main === module) {
  try {
    copyLocalVideo(path.resolve(__dirname, '..'),
      path.join(process.env.TARGET_BUILD_DIR || '', process.env.UNLOCALIZED_RESOURCES_FOLDER_PATH || ''),
      process.env.CONFIGURATION, process.env.LOCAL_VIDEO_ENABLED === '1');
  } catch { console.error('Local video resource preparation failed.'); process.exitCode = 1; }
}
