import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, transition, restoreSession, changeSessionRate } from './session';

test('drawer speed changes preserve the paused phrase, cycle and audio position', () => {
  const saved = { ...createSession({ runId: 'options', stage: 1, phraseCount: 12, mode: 'manual', rate: 1 }),
    phrase: 4, confirmed: 1, phase: 'listening' as const, audioSeconds: 1.25 };
  assert.deepEqual(changeSessionRate(saved, 1.5), { ...saved, rate: 1.5 });
  assert.throws(() => changeSessionRate({ ...saved, running: true }, 1.5));
  assert.throws(() => changeSessionRate(saved, 4));
});

test('audio ending waits for confirmation; three cycles wait for a user decision', () => {
  let s = createSession({ runId: 'test-run', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  for (let cycle = 0; cycle < 3; cycle++) {
    s = transition(s, { type: 'resume' });
    assert.equal(s.phase, 'listening');
    s = transition(s, { type: 'audio-ended', durationSeconds: 2 });
    assert.equal(s.confirmed, cycle);
    assert.equal(s.phase, 'speaking');
    s = transition(s, { type: 'confirm' });
  }
  assert.equal(s.phase, 'decision');
  assert.equal(s.confirmed, 3);
  assert.equal(s.phrase, 0);
  assert.equal(s.running, false);
  s = transition(s, { type: 'next' });
  assert.equal(s.phrase, 1);
  assert.equal(s.confirmed, 0);
});

test('legacy automatic checkpoints resume manually without losing the unfinished cycle', () => {
  let s = createSession({ runId: 'resume', stage: 2, phraseCount: 1, mode: 'auto', rate: 1 });
  s = transition(s, { type: 'resume' });
  s = transition(s, { type: 'audio-position', seconds: 1.25 });
  s = restoreSession(JSON.stringify({ ...s, mode: 'auto' }), 1, 2);
  assert.equal(s.mode, 'manual');
  assert.equal(s.running, false);
  assert.equal(s.audioSeconds, 1.25);
  assert.equal(s.confirmed, 0);
  s = transition(s, { type: 'resume' });
  s = transition(s, { type: 'audio-ended', durationSeconds: 2 });
  assert.equal(s.mode, 'manual');
  s = transition(s, { type: 'tick', elapsedMs: 500 });
  s = restoreSession(JSON.stringify(s), 1, 2);
  s = transition(s, { type: 'tick', elapsedMs: 60000 });
  assert.equal(s.confirmed, 0);
  s = transition(s, { type: 'resume' });
  s = transition(s, { type: 'tick', elapsedMs: 2500 });
  assert.equal(s.confirmed, 0);
  s = transition(s, { type: 'confirm' });
  assert.equal(s.confirmed, 1);
});

test('repeat adds exactly two cycles and final Next completes only after confirmation', () => {
  let s = createSession({ runId: 'complete', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
  assert.equal(transition(s, { type: 'next' }).phase, 'ready');
  const cycle = () => {
    s = transition(s, { type: 'resume' });
    s = transition(s, { type: 'audio-ended', durationSeconds: 1 });
    s = transition(s, { type: 'confirm' });
  };
  cycle(); cycle(); cycle();
  assert.equal(s.phase, 'decision');
  s = transition(s, { type: 'repeat' });
  assert.equal(s.confirmed, 3);
  assert.equal(s.planned, 5);
  cycle(); cycle();
  s = transition(s, { type: 'next' });
  assert.equal(s.phase, 'complete');
  assert.deepEqual(transition(s, { type: 'next' }), s);
  assert.equal(restoreSession(JSON.stringify(s), 1, 1).phase, 'complete');
});

test('new sessions are manual and the full supported rate range survives checkpoints', () => {
  for (const rate of [0.25, 0.3, 1, 2.5, 3]) {
    const s = createSession({ runId: 'rate', stage: 1, phraseCount: 1, mode: 'auto', rate });
    assert.equal(s.mode, 'manual');
    assert.equal(restoreSession(JSON.stringify(s), 1, 1).rate, rate);
  }
  for (const rate of [0, 0.24, 3.01, NaN, Infinity]) {
    assert.throws(() => createSession({ runId: 'bad-rate', stage: 1, phraseCount: 1, mode: 'manual', rate }));
  }
});

test('third-cycle choices are locked during playback and work only after audio ends', () => {
  const initial = createSession({ runId: 'third-choice', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  const listening = { ...initial, confirmed: 2, phase: 'listening' as const, running: true, audioSeconds: 0.5 };
  assert.deepEqual(transition(listening, { type: 'repeat' }), listening);
  assert.deepEqual(transition(listening, { type: 'next' }), listening);
  const legacyListening = { ...listening, mode: 'auto' as const };
  assert.deepEqual(transition(legacyListening, { type: 'next' }), legacyListening);
  const paused = transition(listening, { type: 'pause' });
  assert.deepEqual(transition(paused, { type: 'repeat' }), paused);
  assert.deepEqual(transition(paused, { type: 'next' }), paused);
  assert.deepEqual(transition(paused, { type: 'resume' }), listening);

  const speaking = transition(listening, { type: 'audio-ended', durationSeconds: 2 });
  const repeated = transition(speaking, { type: 'repeat' });
  assert.deepEqual(repeated, { ...initial, confirmed: 3, planned: 5 });
  assert.deepEqual(restoreSession(JSON.stringify(repeated), 2, 1), repeated);
  const next = transition(speaking, { type: 'next' });
  assert.deepEqual(next, { ...initial, phrase: 1 });
  assert.deepEqual(restoreSession(JSON.stringify(next), 2, 1), next);
});

test('next confirms and closes the fifth cycle in one action', () => {
  const initial = createSession({ runId: 'fifth-choice', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  const speaking = { ...initial, planned: 5, confirmed: 4, phase: 'speaking' as const, running: true };
  assert.deepEqual(transition(speaking, { type: 'next' }), { ...initial, phrase: 1 });
  const complete = transition({ ...speaking, phrase: 1 }, { type: 'next' });
  assert.deepEqual(complete, { ...speaking, phrase: 1, confirmed: 5, phase: 'complete', running: false });
  assert.deepEqual(transition(complete, { type: 'next' }), complete);
});

test('legacy seven and nine-cycle speaking checkpoints still require confirm before next', () => {
  const initial = createSession({ runId: 'legacy-long', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  for (const planned of [7, 9]) {
    const speaking = { ...initial, planned, confirmed: planned - 1, phase: 'speaking' as const, running: true };
    assert.deepEqual(transition(speaking, { type: 'next' }), speaking);
    const decision = transition(speaking, { type: 'confirm' });
    assert.equal(decision.phase, 'decision');
    assert.equal(decision.confirmed, planned);
    assert.equal(transition(decision, { type: 'next' }).phrase, 1);
  }
});

test('early choices never bypass the first two cycles or additional practice', () => {
  const initial = createSession({ runId: 'choice-guard', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  const cases = [initial, { ...initial, confirmed: 2 },
    ...[0, 1].map(confirmed => ({ ...initial, confirmed, phase: 'listening' as const, running: true })),
    ...[5, 7].flatMap(planned => [2, 3, planned - 1].map(confirmed =>
      ({ ...initial, planned, confirmed, phase: 'listening' as const, running: true })))];
  for (const state of cases) {
    assert.deepEqual(transition(state, { type: 'repeat' }), state);
    assert.deepEqual(transition(state, { type: 'next' }), state);
  }
});

test('corrupt, foreign-stage and incompatible checkpoints are rejected without resetting progress', () => {
  const s = createSession({ runId: 'invalid', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  for (const patch of [{ version: 2 }, { phrase: 2 }, { confirmed: -1 }, { phase: 'decision' },
    { audioSeconds: -1 }, { remainingMs: null }, { rate: 0 }, { planned: 4 }, { phraseCount: 3 }]) {
    assert.throws(() => restoreSession(JSON.stringify({ ...s, ...patch }), 2, 1));
  }
  assert.throws(() => restoreSession(JSON.stringify(s), 2, 2));
});
