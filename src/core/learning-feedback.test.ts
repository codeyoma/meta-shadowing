import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningFeedback } from './learning-feedback';
import { createSession } from './session';
import { Player } from './player';

const initial = () => createSession({ runId: 'feedback-run', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });

test('durable cycle and phrase progress each produce one distinct feedback event', () => {
  const state = initial();
  const observe = createLearningFeedback(state);
  assert.equal(observe({ ...state, running: true, phase: 'listening' }), null);
  const spoken = { ...state, phase: 'speaking' as const, audioSeconds: 2 };
  assert.equal(observe(spoken), null);
  const confirmed = { ...state, confirmed: 1 };
  assert.equal(observe(confirmed), 'cycle');
  assert.equal(observe(confirmed), null);
  const next = { ...state, phrase: 1 };
  assert.equal(observe(next), 'next');
  assert.equal(observe({ ...next, running: true, phase: 'listening' }), null);
});

test('completion emits once and restored completed sessions do not celebrate', () => {
  const state = initial();
  const done = { ...state, phrase: 1, confirmed: 3, phase: 'complete' as const };
  const observe = createLearningFeedback(state);
  assert.equal(observe(done), 'complete');
  assert.equal(observe({ ...done, running: false }), null);
  assert.equal(createLearningFeedback(done)(done), null);
});

test('failed completion saves emit nothing; successful retry celebrates once without duplicate playback', async () => {
  const state = { ...initial(), phrase: 1, phase: 'speaking' as const, confirmed: 2 };
  const observe = createLearningFeedback(state);
  const events: string[] = [];
  let fail = true;
  const audio = { prepare: async () => {}, play: () => {}, pause: () => {}, position: () => 0, dispose: () => {} };
  const player = new Player(state, audio, saved => {
    if (fail) throw Error('disk full');
    const event = observe(saved);
    if (event) events.push(event);
  }, () => 0, () => {});
  await player.choose('next');
  assert.equal(player.error, 'save');
  assert.deepEqual(events, []);
  fail = false;
  player.retrySave();
  assert.deepEqual(events, ['complete']);
  player.retrySave();
  await player.choose('next');
  player.pause();
  assert.deepEqual(events, ['complete']);
});
