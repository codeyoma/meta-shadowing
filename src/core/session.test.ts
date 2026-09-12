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

test('corrupt, foreign-stage and incompatible checkpoints are rejected without resetting progress', () => {
  const s = createSession({ runId: 'invalid', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  for (const patch of [{ version: 2 }, { phrase: 2 }, { confirmed: -1 }, { phase: 'decision' },
    { audioSeconds: -1 }, { remainingMs: null }, { rate: 0 }, { planned: 4 }, { phraseCount: 3 }]) {
    assert.throws(() => restoreSession(JSON.stringify({ ...s, ...patch }), 2, 1));
  }
  assert.throws(() => restoreSession(JSON.stringify(s), 2, 2));
});
