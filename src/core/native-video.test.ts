import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { videoPlayback } from './video-playback';
import type { nativeVideo } from '../native/video';

// Exercise the real adapter; only native SDK/audio-session boundaries are replaced.
function fixture() {
  const preparations: unknown[][] = [];
  let plays = 0;
  const native = {
    async videoPrepare(...args: unknown[]) { preparations.push(args); },
    async videoPlay() { plays++; }, async videoPause() {},
    addListener() { return { remove() {} }; },
  };
  const module = { exports: {} as { nativeVideo: typeof nativeVideo } };
  const code = ts.transpileModule(readFileSync(new URL('../native/video.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, { module, exports: module.exports, require: (name: string) => {
    if (name === '../../modules/learning-audio') return { __esModule: true, default: native };
    if (name === '@/core/video-playback') return { videoPlayback };
    if (name === './voice-monitor') return { configureLessonAudio: async () => {} };
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return { create: module.exports.nativeVideo, preparations, plays: () => plays };
}

test('video adapter prepares saved source members and restores their combined final frame without playing', async () => {
  const f = fixture();
  const saved = [[0, 1, 2], [3, 4]];
  const video = f.create('owner', undefined, () => {}, () => {}, () => {}, [1, 2, 3, 4, 5], saved);
  try {
    await video.prepare(0, 1.25, 1.5);
    assert.deepEqual(Array.from(f.preparations[0]![2] as number[]), [0, 1, 2]);
    assert.notEqual(f.preparations[0]![2], saved[0]);
    assert.deepEqual(f.preparations[0]!.slice(3), [1.25, 1.5]);
    await video.restoreFrame(1, 2);
    assert.deepEqual(Array.from(f.preparations[1]![2] as number[]), [3, 4]);
    assert.equal(f.preparations[1]![3], 8.999);
    assert.equal(f.plays(), 0);
  } finally { video.dispose(); }
});

test('invalid saved members or durations cannot reach native preparation or frame restore', async () => {
  for (const [durations, units, index] of [
    [[1], [[0]], 1], [[1], [[]], 0], [[1], [[1]], 0], [[1], [[0, 0]], 0],
    [[1, 2], [[1, 0]], 0], [[1], [[0.5]], 0], [[0], [[0]], 0],
    [[NaN], [[0]], 0], [[Infinity], [[0]], 0], [[-1], [[0]], 0],
    [[1, 1, 1, 1, 1], [[0, 1, 2, 3, 4]], 0],
  ] as [number[], number[][], number][]) {
    const f = fixture(), video = f.create('invalid', undefined, () => {}, () => {}, () => {}, durations, units);
    try {
      await assert.rejects(async () => video.prepare(index, 0, 1));
      await assert.rejects(async () => video.restoreFrame(index, 1));
      assert.equal(f.preparations.length, 0);
    } finally { video.dispose(); }
  }
});
