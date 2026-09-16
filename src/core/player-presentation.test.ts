import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition, restoreSession } from './session';
import { createLegacySession as createSession } from '../../tests/legacy-session';
import { cycleTimeline, mainPlayerAction, canOfferRepeat, completedConnections, phraseCounterText, canPulseCycle } from './player-presentation';

const initial = () => createSession({ runId: 'presentation', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });

test('the cycle dot pulses only after audio ends, not while waiting, playing or interrupted', () => {
  let state = initial();
  assert.equal(canPulseCycle(state), false);
  state = transition(state, { type: 'resume' });
  assert.equal(canPulseCycle(state), false);
  assert.equal(canPulseCycle(transition(state, { type: 'pause' })), false);
  state = transition(state, { type: 'audio-ended', durationSeconds: 4 });
  assert.equal(canPulseCycle(state), true);
  assert.equal(canPulseCycle(transition(state, { type: 'pause' })), true);
  state = transition(state, { type: 'confirm' });
  assert.equal(canPulseCycle(state), false);
  assert.equal(canPulseCycle({ ...state, confirmed: 3, phase: 'decision' }), false);
  assert.equal(canPulseCycle({ ...state, confirmed: 3, phase: 'complete' }), false);
});

test('counter space depends on total phrase digits, not the growing current position', () => {
  for (const current of [1, 9, 10, 99]) {
    assert.deepEqual(phraseCounterText(current, 99), { label: `${current}/99`, measure: '88/88' });
  }
  for (const current of [1, 9, 10, 99, 100, 560]) {
    assert.deepEqual(phraseCounterText(current, 560), { label: `${current}/560`, measure: '888/888' });
  }
  assert.equal(phraseCounterText(1, 100).measure, '888/888');
  assert.equal(phraseCounterText(1, 1000).measure, '8888/8888');
});

test('repeat is offered at the initial choice, never after five or legacy longer practice', () => {
  const decision = { ...initial(), phase: 'decision' as const, confirmed: 3 };
  assert.equal(canOfferRepeat(initial(), null), false);
  assert.equal(canOfferRepeat(decision, null), true);
  assert.equal(canOfferRepeat(decision, 'audio'), false);
  for (const planned of [5, 7, 9]) {
    assert.equal(canOfferRepeat({ ...decision, planned, confirmed: planned }, null), false);
  }
  assert.equal(canOfferRepeat({ ...decision, phase: 'complete' }, null), false);
});

test('third-cycle choices stay visible while playback locks both actions', () => {
  const ready = { ...initial(), confirmed: 2 };
  assert.equal(canOfferRepeat(ready, null), false);
  assert.equal(mainPlayerAction(ready, null), 'resume');
  const listening = { ...ready, phase: 'listening' as const, running: true };
  assert.equal(canOfferRepeat(listening, null), true);
  assert.equal(mainPlayerAction(listening, null), 'wait');
  assert.equal(mainPlayerAction({ ...listening, running: false }, null), 'resume');
  const speaking = { ...listening, phase: 'speaking' as const };
  assert.equal(canOfferRepeat(speaking, null), true);
  assert.equal(mainPlayerAction(speaking, null), 'next');
  assert.equal(canOfferRepeat(speaking, 'save'), false);
  assert.equal(mainPlayerAction(speaking, 'audio'), 'recover');
  for (const planned of [5, 7]) {
    assert.equal(canOfferRepeat({ ...speaking, planned }, null), false);
    assert.notEqual(mainPlayerAction({ ...speaking, planned }, null), 'next');
  }
});

test('the fifth speaking cycle uses next for one-tap completion', () => {
  const fifth = { ...initial(), planned: 5, confirmed: 4, phase: 'speaking' as const, running: true };
  assert.equal(mainPlayerAction(fifth, null), 'next');
  assert.equal(canOfferRepeat(fifth, null), false);
});

test('legacy seven and nine-cycle final speaking passes keep the confirm action', () => {
  for (const planned of [7, 9]) {
    const speaking = { ...initial(), planned, confirmed: planned - 1, phase: 'speaking' as const, running: true };
    assert.equal(mainPlayerAction(speaking, null), 'confirm');
    assert.equal(canOfferRepeat(speaking, null), false);
  }
});

test('connections fill only after explicit confirmation and extend to the next active node', () => {
  let state = transition(initial(), { type: 'resume' });
  state = transition(state, { type: 'audio-ended', durationSeconds: 4 });
  assert.equal(completedConnections(state), 0);
  state = transition(state, { type: 'confirm' });
  assert.equal(completedConnections(state), 1);
  assert.equal(completedConnections({ ...state, confirmed: 2 }), 2);
  assert.equal(completedConnections({ ...state, confirmed: 3, phase: 'decision' }), 2);
  assert.equal(completedConnections({ ...state, confirmed: 3, planned: 5 }), 3);
  assert.equal(completedConnections({ ...state, confirmed: 5, planned: 5, phase: 'decision' }), 4);
});

test('the icon action waits for audio and requires a tap to confirm, including paused speaking', () => {
  let state = initial();
  assert.equal(mainPlayerAction(state, null), 'resume');
  state = transition(state, { type: 'resume' });
  assert.equal(mainPlayerAction(state, null), 'wait');
  state = transition(state, { type: 'audio-ended', durationSeconds: 4 });
  assert.equal(mainPlayerAction(state, null), 'confirm');
  assert.equal(mainPlayerAction(transition(state, { type: 'pause' }), null), 'confirm');
  assert.equal(mainPlayerAction(state, 'save'), 'recover');
  assert.equal(state.confirmed, 0);
  state = { ...state, phase: 'decision', confirmed: 3, running: false };
  assert.equal(mainPlayerAction(state, null), 'next');
  assert.equal(mainPlayerAction({ ...state, phase: 'complete' }, null), 'leave');
});

test('cycle progress uses audio position and unknown duration never invents progress', () => {
  const state = { ...initial(), phase: 'listening' as const, running: true, audioSeconds: 2, confirmed: 1 };
  assert.deepEqual(cycleTimeline(state, 4), { count: 3, confirmed: 1, active: 1, progress: 0.5 });
  assert.equal(cycleTimeline(state, 0).progress, 0);
  assert.equal(cycleTimeline(state, NaN).progress, 0);
  assert.equal(cycleTimeline(state, 1).progress, 1);
  assert.equal(cycleTimeline({ ...state, running: false }, 4).progress, 0.5);
  assert.equal(cycleTimeline({ ...state, phase: 'speaking', audioSeconds: 0 }, 4).progress, 1);
  assert.equal(cycleTimeline({ ...state, phase: 'ready', audioSeconds: 0 }, 4).progress, 0);
});

test('repeat expands to five only; legacy longer checkpoints keep their existing nodes', () => {
  const decision = { ...initial(), phase: 'decision' as const, confirmed: 3 };
  assert.equal(cycleTimeline(decision, 4).active, -1);
  const repeated = transition(decision, { type: 'repeat' });
  assert.deepEqual(cycleTimeline(repeated, 4), { count: 5, confirmed: 3, active: 3, progress: 0 });
  const again = transition({ ...repeated, phase: 'decision', confirmed: 5 }, { type: 'repeat' });
  assert.deepEqual(cycleTimeline(again, 4), { count: 5, confirmed: 5, active: -1, progress: 0 });
  const legacy = restoreSession(JSON.stringify({ ...decision, planned: 7, confirmed: 7 }), 2, 1);
  assert.deepEqual(cycleTimeline(legacy, 4), { count: 7, confirmed: 7, active: -1, progress: 0 });
  assert.deepEqual(transition(legacy, { type: 'repeat' }), legacy);
  const next = transition(decision, { type: 'next' });
  assert.deepEqual(cycleTimeline(next, 4), { count: 3, confirmed: 0, active: 0, progress: 0 });
});
