import assert from 'node:assert/strict';
import { test } from 'node:test';

test('free catalog accepts only the native-enabled test identity with valid pinned audio', async () => {
  const module = await import('./free-test-package').catch(() => ({}));
  assert.ok('readFreeTestPackage' in module, 'Native-gated free catalog decoder must exist');
  const read = (module as typeof import('./free-test-package')).readFreeTestPackage;
  const manifest = { id: 'duo-33-free-test', version: 1, title: 'DUO 3.3 · 무료 테스트', phrases: [
    { text: 'Hello.', translation: '안녕.', file: 'audio/phrase-001.m4a', bytes: 3, sha256: 'a'.repeat(64) },
  ] };
  assert.equal(read(null), null);
  assert.equal(read('not json'), null);
  assert.equal(read(JSON.stringify({ ...manifest, id: 'paid-duo' })), null);
  assert.equal(read(JSON.stringify({ ...manifest, phrases: [{...manifest.phrases[0], file: '../escape'}] })), null);
  assert.equal(read(JSON.stringify({ ...manifest, phrases: [manifest.phrases[0], manifest.phrases[0]] })), null);
  const pack = read(JSON.stringify(manifest));
  assert.equal(pack?.manifest.id, 'duo-33-free-test');
  assert.equal(pack?.delivery, 'appleHosted');
  assert.equal(pack?.language, 'english');
  assert.equal(read(JSON.stringify({ ...manifest, version: 2 }))?.manifest.version, 2);
  assert.equal(read(JSON.stringify({ ...manifest, version: 3 })), null);
});
