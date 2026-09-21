import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, transition } from './session';
import { lessonRemoteSnapshot, takeLessonRemoteAction } from './lesson-remote';

test('headset uses the same manual confirmation and never skips unfinished playback', () => {
  const initial = createSession({ runId: 'remote', stage: 1, phraseCount: 2, rate: 1, mode: 'manual' });
  assert.equal(lessonRemoteSnapshot(initial, null, true).actionable, true);
  const listening = transition(initial, { type: 'resume' });
  assert.equal(lessonRemoteSnapshot(listening, null, true).actionable, false);
  const speaking = transition(listening, { type: 'audio-ended', durationSeconds: 1 });
  assert.equal(lessonRemoteSnapshot(speaking, null, true).actionable, true);
  assert.notEqual(lessonRemoteSnapshot(initial, null, true).revision,
    lessonRemoteSnapshot(speaking, null, true).revision);
});

test('errors, unavailable UI, and completed lessons cannot be confirmed remotely', () => {
  const initial = createSession({ runId: 'remote', stage: 1, phraseCount: 1, rate: 1, mode: 'manual' });
  for (const error of ['audio', 'save'] as const) assert.equal(lessonRemoteSnapshot(initial, error, true).actionable, false);
  assert.equal(lessonRemoteSnapshot(initial, null, false).actionable, false);
  assert.equal(lessonRemoteSnapshot(null, null, true).actionable, false);
  assert.equal(lessonRemoteSnapshot({ ...initial, phase: 'complete' }, null, true).actionable, false);
});

test('silent reveal stages only accept the explicit confirmation once reveal has finished', () => {
  const initial = createSession({ runId: 'silent', stage: 15, phraseCount: 2, rate: 1, mode: 'manual' });
  const showing = { ...initial, phase: 'listening' as const, running: true };
  assert.equal(lessonRemoteSnapshot(showing, null, true).actionable, false);
  const finished = { ...showing, phase: 'speaking' as const };
  assert.equal(lessonRemoteSnapshot(finished, null, true).actionable, true);
  assert.notEqual(lessonRemoteSnapshot(finished, null, true).revision,
    lessonRemoteSnapshot({ ...finished, phrase: 1 }, null, true).revision);
});

test('double-press offers the existing two extra cycles only after third-cycle audio ends', () => {
  const initial = createSession({ runId: 'repeat', stage: 1, phraseCount: 2, rate: 1, mode: 'manual' });
  const third = { ...initial, confirmed: 2, phase: 'listening' as const, running: true };
  assert.equal(lessonRemoteSnapshot(third, null, true).repeatable, false);
  assert.equal(lessonRemoteSnapshot({ ...third, running: false }, null, true).repeatable, false);
  const finished = transition(third, { type: 'audio-ended', durationSeconds: 1 });
  assert.equal(lessonRemoteSnapshot(finished, null, true).repeatable, true);
  const repeated = transition(finished, { type: 'repeat' });
  assert.equal(repeated.planned, 5);
  assert.equal(repeated.confirmed, 3);
  assert.equal(repeated.phrase, 0);
  assert.equal(repeated.phase, 'ready');
  assert.equal(lessonRemoteSnapshot(repeated, null, true).repeatable, false);
  assert.equal(lessonRemoteSnapshot({ ...repeated, confirmed: 4, phase: 'speaking' }, null, true).repeatable, false);
  for (const error of ['audio', 'save'] as const) assert.equal(lessonRemoteSnapshot(finished, error, true).repeatable, false);
  assert.equal(lessonRemoteSnapshot(finished, null, false).repeatable, false);
  assert.equal(lessonRemoteSnapshot(initial, null, true).repeatable, false);
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    assert.equal(lessonRemoteSnapshot({ ...finished, stage }, null, true).repeatable, false);
  }
});

test('repeat and main share one consumption gate, rejecting stale and unavailable actions', () => {
  const gate = { owner: 'lesson', revision: 'third', actionable: true, repeatable: true };
  assert.equal(takeLessonRemoteAction(gate, { ...gate, owner: 'old', action: 'repeat' }), null);
  assert.equal(takeLessonRemoteAction(gate, { ...gate, revision: 'old', action: 'repeat' }), null);
  assert.equal(takeLessonRemoteAction(gate, { ...gate, action: 'unknown' }), null);
  assert.equal(takeLessonRemoteAction(gate, { ...gate, action: 'repeat' }), 'repeat');
  assert.equal(takeLessonRemoteAction(gate, { ...gate, action: 'main' }), null);
  assert.equal(takeLessonRemoteAction(gate, { ...gate, action: 'repeat' }), null);
  const first = { owner: 'lesson', revision: 'first', actionable: true, repeatable: false };
  assert.equal(takeLessonRemoteAction(first, { ...first, action: 'repeat' }), null);
  assert.equal(takeLessonRemoteAction(first, { ...first, action: 'main' }), 'main');
  // Existing installed native builds emit no action discriminator.
  assert.equal(takeLessonRemoteAction({ ...first, actionable: true }, first), 'main');
});
