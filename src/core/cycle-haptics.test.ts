import test from 'node:test';
import assert from 'node:assert/strict';
import { createCycleHaptics } from './cycle-haptics';
import { createSession, transition, type Action } from './session';
import { Player } from './player';

const initial = () => createSession({ runId: 'haptics', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });

test('confirmed cycles have short rising rhythms; Repeat replaces cycle three with one tap', () => {
  let state = initial();
  const observe = createCycleHaptics(state);
  const act = (action: Action) => observe(state = transition(state, action));
  const speak = () => {
    assert.equal(act({ type: 'resume' }), null);
    assert.equal(act({ type: 'audio-ended', durationSeconds: 1 }), null);
  };
  const lengths = [];
  for (const action of ['confirm', 'confirm', 'repeat', 'confirm', 'next'] as const) {
    speak();
    const pulses = act({ type: action })!;
    lengths.push(pulses.length);
    assert.equal(pulses[0]!.time, 0);
    assert.ok(pulses.every((p, i) => p.time === i * 0.08 && p.intensity > 0 && p.intensity < 1));
    if (pulses.length === 2) assert.ok(pulses[1]!.intensity > pulses[0]!.intensity);
    if (pulses.length >= 3) {
      assert.equal(pulses[0]!.intensity, pulses[1]!.intensity);
      assert.ok(pulses[2]!.intensity > pulses[1]!.intensity);
    }
    if (pulses.length === 4) assert.ok(pulses[3]!.intensity < pulses[0]!.intensity);
    assert.equal(observe(state), null);
  }
  assert.deepEqual(lengths, [2, 3, 1, 2, 4]);
  assert.equal(state.phrase, 1);
});

test('ordinary final Next produces cycle three rhythm, but restoration and already-confirmed Next stay quiet', () => {
  const speaking = { ...initial(), confirmed: 2, phase: 'speaking' as const, running: true };
  const done = transition(speaking, { type: 'next' });
  assert.equal(createCycleHaptics(speaking)(done)?.length, 4);
  assert.equal(createCycleHaptics(done)(done), null);
  const decision = transition(speaking, { type: 'confirm' });
  assert.equal(createCycleHaptics(decision)(transition(decision, { type: 'next' })), null);
  assert.equal(createCycleHaptics(decision)(transition(decision, { type: 'repeat' }))?.length, 1);
  assert.equal(createCycleHaptics(speaking)({ ...done, runId: 'other' }), null);
});

test('failed save stays quiet; retry emits the final cycle once without changing completion', async () => {
  const state = { ...initial(), phrase: 1, confirmed: 4, planned: 5, phase: 'speaking' as const };
  const observe = createCycleHaptics(state);
  const counts: number[] = [];
  let fail = true;
  const audio = { prepare: async () => {}, play: () => {}, pause: () => {}, position: () => 0, dispose: () => {} };
  const player = new Player(state, audio, saved => {
    if (fail) throw Error('disk full');
    const pulses = observe(saved);
    if (pulses) counts.push(pulses.length);
  }, () => 0, () => {});
  await player.choose('next');
  assert.deepEqual(counts, []);
  fail = false;
  player.retrySave();
  player.retrySave();
  player.pause();
  assert.deepEqual(counts, [4]);
  assert.equal(player.state.phase, 'complete');
});
