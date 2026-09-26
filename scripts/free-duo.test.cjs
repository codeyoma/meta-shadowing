const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const load = () => { try { return require('./free-duo.cjs'); } catch { return {}; } };

test('preparation preserves dialogue as one audio unit and rejects ambiguous source blocks', () => {
  const { parseDuo } = load();
  assert.equal(typeof parseDuo, 'function', 'DUO source parser must exist');
  const source = '## Section 1\n\nHello.\n안녕.\n\nOne.\nTwo.\n하나.\n둘.';
  assert.deepEqual(parseDuo(source, 2, 1), [
    { text: 'Hello.', translation: '안녕.', section: 1 },
    { text: 'One.\nTwo.', translation: '하나.\n둘.', section: 1 },
  ]);
  assert.throws(() => parseDuo(source, 3, 1));
  assert.throws(() => parseDuo('## Section 1\n\nEnglish only.', 1, 1));
  assert.throws(() => parseDuo('## Section 1\n\nOne.\n하나.\nTwo.', 1, 1));
});

test('archive preparation accepts exactly numbered audio and rejects traversal, duplicates and missing audio', () => {
  const { audioEntries } = load();
  assert.equal(typeof audioEntries, 'function', 'Archive allowlist must exist');
  assert.deepEqual(audioEntries(['002.mp3', '__MACOSX/._001.mp3', '001.mp3'], 2), ['001.mp3', '002.mp3']);
  for (const entries of [['../001.mp3'], ['001.mp3', '001.mp3'], ['001.mp3'], ['001.mp3', '002.mp3', 'secret.txt']]) {
    assert.throws(() => audioEntries(entries, 2));
  }
});

test('normal prebuild strips stale free content and internal build requires explicit prepared package', t => {
  const { configureFreeDuo } = load();
  assert.equal(typeof configureFreeDuo, 'function', 'Free build gate must exist');
  const stale = { FreeDuoEnabled: true, FreeDuoManifest: 'private', FreeDuoDescriptor: 'private', Other: 1 };
  configureFreeDuo(stale, {}, '.');
  assert.deepEqual(stale, { Other: 1 });
  assert.throws(() => configureFreeDuo({}, { APPLE_FREE_DUO_TEST: '1' }, '.'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-duo-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'private/free-duo'), { recursive: true });
  const manifest = { id: 'duo-33-free-test', version: 1, title: 'DUO 3.3 · 무료 테스트', phrases: [{text:'Hello.',translation:'안녕.',file:'audio/phrase-001.m4a',bytes:3,sha256:'a'.repeat(64)}] };
  fs.writeFileSync(path.join(root, 'private/free-duo/manifest.json'), JSON.stringify(manifest));
  const result = {};
  configureFreeDuo(result, { APPLE_FREE_DUO_TEST: '1', APPLE_BUILD_CHANNEL: 'internal', APPLE_ASSET_APP_GROUP: 'group.example.test' }, root);
  assert.equal(result.FreeDuoEnabled, true);
  assert.equal(JSON.parse(result.FreeDuoDescriptor).key, 'duo-33-free-test-v1');
  assert.equal(JSON.parse(result.FreeDuoDescriptor).files.length, 2);
  assert.equal(result.FreeDuoAssetPackID, 'duo-33-free-test-v1');
  const syntax = Buffer.from('{"fixture":true}');
  manifest.metadata = [{ file: 'syntax.json', bytes: syntax.length, sha256: require('./free-duo.cjs').hash(syntax) }];
  fs.writeFileSync(path.join(root, 'private/free-duo/manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, 'private/free-duo/syntax.json'), syntax);
  configureFreeDuo(result, { APPLE_FREE_DUO_TEST: '1', APPLE_BUILD_CHANNEL: 'internal', APPLE_ASSET_APP_GROUP: 'group.example.test' }, root);
  assert.equal(JSON.parse(result.FreeDuoDescriptor).files.at(-1).file, 'syntax.json');
  fs.mkdirSync(path.join(root, 'private/free-duo-v2'));
  fs.writeFileSync(path.join(root, 'private/free-duo-v2/manifest.json'), JSON.stringify({ ...manifest, version: 2 }));
  fs.writeFileSync(path.join(root, 'private/free-duo-v2/syntax.json'), syntax);
  configureFreeDuo(result, { APPLE_FREE_DUO_TEST: '1', APPLE_BUILD_CHANNEL: 'internal', APPLE_ASSET_APP_GROUP: 'group.example.test' }, root);
  assert.equal(result.FreeDuoAssetPackID, 'duo-33-free-test-v2');
  assert.equal(JSON.parse(result.FreeDuoDescriptor).key, 'duo-33-free-test-v2');
  assert.equal(JSON.parse(result.FreeDuoDescriptor).files.at(-1).sha256, manifest.metadata[0].sha256);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'private/free-duo/manifest.json'))).version, 1);
  fs.writeFileSync(path.join(root, 'private/free-duo-v2/syntax.json'), 'corrupt');
  fs.writeFileSync(path.join(root, 'private/free-duo/syntax.json'), 'corrupt');
  assert.throws(() => configureFreeDuo({}, { APPLE_FREE_DUO_TEST: '1', APPLE_BUILD_CHANNEL: 'internal', APPLE_ASSET_APP_GROUP: 'group.example.test' }, root));
  assert.throws(() => configureFreeDuo({}, { APPLE_FREE_DUO_TEST: '1', APPLE_BUILD_CHANNEL: 'production' }, root));
});
