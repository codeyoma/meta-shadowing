const { withXcodeProject } = require('expo/config-plugins');
module.exports = config => withXcodeProject(config, mod => {
  const project = mod.modResults;
  const name = 'Prepare private local video';
  const target = project.getFirstTarget().uuid;
  if (!Object.values(project.hash.project.objects.PBXShellScriptBuildPhase || {}).some(p => p.name === JSON.stringify(name))) {
    project.addBuildPhase([], 'PBXShellScriptBuildPhase', name, target, {
      shellPath: '/bin/sh',
      shellScript: 'set -e\nif [ -f "$PROJECT_DIR/.xcode.env" ]; then . "$PROJECT_DIR/.xcode.env"; fi\n"${NODE_BINARY:-node}" "$PROJECT_DIR/../scripts/copy-local-video.cjs"',
    });
  }
  for (const entry of Object.values(project.pbxXCBuildConfigurationSection())) {
    if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
    entry.buildSettings.LOCAL_VIDEO_ENABLED = entry.name === 'Debug' && process.env.LOCAL_VIDEO_ENABLED === '1' ? '1' : '0';
  }
  return mod;
});
