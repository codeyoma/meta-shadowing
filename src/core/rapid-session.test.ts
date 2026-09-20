import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, restoreSession, transition } from './session';
import { playableStage } from './catalog';
import { canOpenStage } from './stage-overview';
import { mainPlayerAction, canOfferRepeat } from './player-presentation';

test('silent stages require one reveal and one confirmation per phrase, with no repeat', () => {
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    let state = createSession({ runId: 'single-pass', stage, phraseCount: 2, mode: 'manual', rate: 1 });
    assert.equal(state.planned, 1);
    state = transition(state, { type: 'resume' });
    assert.equal(transition(state, { type: 'next' }).phrase, 0, 'Cannot skip an unfinished reveal');
    state = transition(state, { type: 'audio-ended', durationSeconds: 1 });
    assert.equal(mainPlayerAction(state, null), 'next');
    assert.equal(canOfferRepeat(state, null), false);
    assert.deepEqual(transition(state, { type: 'repeat' }), state);
    state = transition(state, { type: 'confirm' });
    assert.equal(state.phrase, 1);
    assert.equal(state.unitProgress![0]!.confirmed, 1);
    assert.equal(state.planned, 1);
    state = transition(transition(state, { type: 'resume' }), { type: 'audio-ended', durationSeconds: 1 });
    state = transition(state, { type: 'next' });
    assert.equal(state.phase, 'complete');
    assert.deepEqual(restoreSession(JSON.stringify(state), 2, stage), state);
  }
});

test('old silent checkpoints preserve completed units and require only one more pass for unfinished units', () => {
  const state = createSession({ runId: 'legacy', stage: 11, phraseCount: 3, mode: 'manual', rate: 1 });
  const legacy = { ...state, phrase: 1, confirmed: 1, planned: 3, audioSeconds: 0.3,
    unitProgress: [{ confirmed: 3, planned: 3 }, { confirmed: 1, planned: 3 }, { confirmed: 0, planned: 5 }] };
  const restored = restoreSession(JSON.stringify(legacy), 3, 11);
  assert.deepEqual(restored.unitProgress, [{ confirmed: 3, planned: 3 }, { confirmed: 1, planned: 2 }, { confirmed: 0, planned: 1 }]);
  assert.equal(restored.audioSeconds, 0.3);
  assert.equal(restored.confirmed, 1);
  assert.equal(restored.planned, 2);
  assert.deepEqual(restoreSession(JSON.stringify(restored), 3, 11), restored);
});

test('rapid stages create restorable silent timing checkpoints without bypassing release progression', () => {
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    assert.equal(playableStage(String(stage)), stage);
    assert.equal(canOpenStage(stage, [], false), false);
    assert.equal(canOpenStage(stage, [], true), true);
    const state = createSession({ runId: 'rapid', stage, phraseCount: 2, mode: 'manual', rate: 1 });
    assert.deepEqual(state.reveal, { speed: 1, wpm: 150 });
    const running = transition(state, { type: 'resume' });
    const paused = restoreSession(JSON.stringify({ ...running, audioSeconds: 0.6 }), 2, stage);
    assert.equal(paused.running, false);
    assert.equal(paused.audioSeconds, 0.6);
    assert.equal(paused.confirmed, 0);
    assert.deepEqual(paused.reveal, { speed: 1, wpm: 150 });
  }
});

test('rapid checkpoint validation refuses missing or invalid speed metadata and leaves audio stages unchanged', () => {
  const state = createSession({ runId: 'rapid', stage: 11, phraseCount: 1, mode: 'manual', rate: 1 });
  for (const reveal of [undefined, null, { speed: 0, wpm: 150 }, { speed: 5, wpm: 150 }, { speed: 1, wpm: 0 }, { speed: 1, wpm: 1000 }]) {
    assert.throws(() => restoreSession(JSON.stringify({ ...state, reveal }), 1, 11));
  }
  const old = createSession({ runId: 'old', stage: 1, phraseCount: 1, mode: 'manual', rate: 0.75 });
  assert.equal(old.reveal, undefined);
  assert.deepEqual(restoreSession(JSON.stringify(old), 1, 1), old);
});
