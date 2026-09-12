import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageOverview, bookAction, canOpenStage, stageStars } from './stage-overview';
import { createSession } from './session';

test('book progress counts completed stages once, not repeated runs or partial checkpoints', () => {
  const session = createSession({ runId: 'unfinished', stage: 2, phraseCount: 12, mode: 'manual', rate: 1 });
  assert.deepEqual(stageOverview([{ stage: 1, count: 9, session: null }, { stage: 2, count: 0, session }]),
    { completed: 1, total: 16, percent: 6, current: 2 });
});

test('resume prefers an unfinished playable stage; never routes into unavailable stages', () => {
  const session = createSession({ runId: 'repeat', stage: 2, phraseCount: 12, mode: 'manual', rate: 1 });
  assert.equal(stageOverview([{ stage: 1, count: 2, session: null }, { stage: 2, count: 3, session }]).current, 2);
  assert.equal(stageOverview([{ stage: 1, count: 2, session: null }, { stage: 2, count: 3, session: null }]).current, 1);
  assert.equal(stageOverview([]).percent, 0);
});

test('later saved sessions do not bypass the current stage required repetitions', () => {
  const session = createSession({ runId: 'old-stage-2', stage: 2, phraseCount: 12, mode: 'manual', rate: 1 });
  const records = [{ stage: 1, count: 1, session: null }, { stage: 2, count: 0, session }];
  assert.equal(stageOverview(records).current, 1);
  assert.equal(stageOverview(records).completed, 0);
  assert.equal(canOpenStage(1, records), true);
  assert.equal(canOpenStage(2, records), false);
  records[0]!.count = 2;
  assert.equal(canOpenStage(2, records), true);
  assert.equal(stageOverview(records).current, 2);
  assert.equal(canOpenStage(1, records), true);
  assert.equal(canOpenStage(3, records), false);
  assert.equal(canOpenStage(0, records), false);
});

test('ownership and local installation have separate purchase, download and resume actions', () => {
  assert.equal(bookAction(false, false), 'purchase');
  assert.equal(bookAction(false, true), 'purchase');
  assert.equal(bookAction(true, false), 'download');
  assert.equal(bookAction(true, true), 'resume');
});

test('stars fill once per completed full run, cap at the requirement, and ignore partial cycles', () => {
  const session = createSession({ runId: 'partial', stage: 1, phraseCount: 12, mode: 'manual', rate: 1 });
  session.confirmed = 2;
  assert.deepEqual(stageStars({ stage: 1, count: 0, session }), [false, false]);
  assert.deepEqual(stageStars({ stage: 1, count: 1, session }), [true, false]);
  assert.deepEqual(stageStars({ stage: 10, count: 2, session: null }), [true, true]);
  assert.deepEqual(stageStars({ stage: 11, count: 2, session: null }), [true, true, false]);
  assert.deepEqual(stageStars({ stage: 16, count: 3, session: null }), [true, true, true]);
  assert.deepEqual(stageStars({ stage: 16, count: 9, session: null }), [true, true, true]);
});
