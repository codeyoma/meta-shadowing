import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installPackage, verifyPackage, type PackageIO } from './package';
import { readFileSync } from 'node:fs';
import manifest from '../../assets/sample/manifest.json';

const audio = new TextEncoder().encode('controlled audio bytes');
const hash = (bytes: Uint8Array) => Promise.resolve(createHash('sha256').update(bytes).digest('hex'));

test('a package becomes available only after every stored asset is verified', async () => {
  const manifest = { phrases: [{ file: 'audio/one.m4a', bytes: audio.length, sha256: await hash(audio) }] };
  const files = new Map<string, Uint8Array>();
  let ready = false;
  const io: PackageIO = {
    source: async () => audio, read: async key => files.get(key) ?? null,
    write: async (key, bytes) => { assert.equal(ready, false); files.set(key, bytes); },
    markReady: async value => { ready = value; }, hash,
  };
  assert.equal(await verifyPackage(manifest, io), false);
  await installPackage(manifest, io);
  assert.equal(ready, true);
  assert.equal(await verifyPackage(manifest, io), true);
  files.delete('audio/one.m4a');
  assert.equal(await verifyPackage(manifest, io), false);
  io.write = async (key, bytes) => { files.set(key, bytes.slice(1)); };
  await assert.rejects(installPackage(manifest, io));
  assert.equal(ready, false);
});

test('damaged source, unsafe paths and interrupted writes never expose a ready package', async () => {
  let ready = false;
  const io: PackageIO = { source: async () => audio.slice(1), read: async () => null,
    write: async () => { throw new Error('storage full'); }, hash,
    markReady: async value => { ready = value; } };
  const phrase = { file: 'audio/one.m4a', bytes: audio.length, sha256: await hash(audio) };
  await assert.rejects(installPackage({ phrases: [phrase] }, io));
  io.source = async () => audio;
  await assert.rejects(installPackage({ phrases: [phrase] }, io));
  await assert.rejects(installPackage({ phrases: [{ ...phrase, file: '../other/file' }] }, io));
  assert.equal(ready, false);
});

test('all twelve shipped speech assets match the controlled manifest', async () => {
  assert.equal(manifest.phrases.length, 12);
  for (const p of manifest.phrases) {
    const bytes = readFileSync(new URL(`../../assets/sample/${p.file}`, import.meta.url));
    assert.equal(bytes.length, p.bytes);
    assert.equal(await hash(bytes), p.sha256);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    assert.ok(p.text.length > 0 && p.translation.length > 0);
  }
});
