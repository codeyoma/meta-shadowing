import test from 'node:test';
import assert from 'node:assert/strict';
import { readVideoPackage, videoStageAvailable } from './video-package';

const manifest = () => ({
  kind: 'video', schemaVersion: 1, id: 'video-practice', version: 1, title: 'Video practice',
  media: { file: 'video/source.mp4', bytes: 100, sha256: 'a'.repeat(64), duration: 30 },
  phrases: [{ id: 'one', start: 10, end: 12.5, text: 'Open the window.', translation: '창문을 여세요.' }],
});
test('invalid identity, media, text and timelines cannot become an installed lesson', () => {
  const variants = [
    { ...manifest(), version: 0 }, { ...manifest(), id: '../outside' },
    { ...manifest(), schemaVersion: 2 }, { ...manifest(), phrases: [] },
    { ...manifest(), media: { ...manifest().media, file: '../source.mp4' } },
    { ...manifest(), media: { ...manifest().media, bytes: 0 } },
    { ...manifest(), media: { ...manifest().media, sha256: 'no' } },
    ...[{ start: -1 }, { end: 10 }, { end: 31 }, { text: ' ' }, { translation: '' }].map(change =>
      ({ ...manifest(), phrases: [{ ...manifest().phrases[0], ...change }] })),
    { ...manifest(), phrases: [...manifest().phrases, ...manifest().phrases] },
    { ...manifest(), phrases: [...manifest().phrases, { ...manifest().phrases[0], id: 'two', start: 11 }] },
  ];
  for (const invalid of variants) assert.throws(() => readVideoPackage(JSON.stringify(invalid)), /Unsupported video package/);
  assert.throws(() => readVideoPackage({}), /Unsupported video package/);
});
test('a prepared video package preserves final text and supports all sixteen stages', () => {
  const pack = readVideoPackage(JSON.stringify(manifest()))!;
  assert.equal(pack.manifest.phrases[0]?.text, 'Open the window.');
  assert.equal(pack.manifest.phrases[0]?.translation, '창문을 여세요.');
  assert.equal(pack.manifest.media.file, 'video/source.mp4');
  assert.equal(readVideoPackage(null), null);
  for (let stage = 1; stage <= 16; stage++) assert.equal(videoStageAvailable(stage), true);
  for (const stage of [0, 17, 1.5, NaN, Infinity]) assert.equal(videoStageAvailable(stage), false);
});
