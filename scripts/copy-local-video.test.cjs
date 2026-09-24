const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { copyLocalVideo } = require('./copy-local-video.cjs');
test('only explicit Debug builds include local content; Release clears stale resources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-build-'));
  try {
    const source = path.join(root, 'private/local-video'), product = path.join(root, 'app');
    fs.mkdirSync(path.join(source, 'video'), { recursive: true }); fs.mkdirSync(product);
    fs.writeFileSync(path.join(source, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(source, 'video/source.mp4'), 'fixture');
    copyLocalVideo(root, product, 'Debug', false);
    assert.equal(fs.existsSync(path.join(product, 'LocalVideo')), false);
    copyLocalVideo(root, product, 'Debug', true);
    assert.equal(fs.readFileSync(path.join(product, 'LocalVideo/video/source.mp4'), 'utf8'), 'fixture');
    copyLocalVideo(root, product, 'Release', true);
    assert.equal(fs.existsSync(path.join(product, 'LocalVideo')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
