import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageOverview, bookAction, canOpenStage, stageStars, stageComplete } from './stage-overview';
import { createSession } from './session';

test('implemented stages require three predecessor runs unless explicitly bypassed', () => {
  for (let stage = 2; stage <= 16; stage++) {
    assert.equal(canOpenStage(stage, [{ stage: stage - 1, count: 2, session: null }]), false);
    assert.equal(canOpenStage(stage, [{ stage: stage - 1, count: 3, session: null }]), true);
    assert.equal(canOpenStage(stage, [], true), true);
  }
  for (const stage of [0, 17, 20, 1.5]) assert.equal(canOpenStage(stage, [], true), false);
});

test('book progress counts completed stages once, not repeated runs or partial checkpoints', () => {
  const session = createSession({ runId: 'unfinished', stage: 2, phraseCount: 12, mode: 'manual', rate: 1 });
  assert.deepEqual(stageOverview([{ stage: 1, count: 9, session: null }, { stage: 2, count: 0, session }]),
    { completed: 1, total: 16, percent: 6, current: 2 });
});

test('resume prefers an unfinished playable stage; never routes into unavailable stages', () => {
  const session = createSession({ runId: 'repeat', stage: 2, phraseCount: 12, mode: 'manual', rate: 1 });
  assert.equal(stageOverview([{ stage: 1, count: 3, session: null }, { stage: 2, count: 3, session }]).current, 2);
  assert.equal(stageOverview([{ stage: 1, count: 3, session: null }, { stage: 2, count: 3, session: null }]).current, 1);
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
  assert.equal(canOpenStage(2, records), false);
  assert.equal(stageOverview(records).completed, 0);
  records[0]!.count = 3;
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

test('latest unfinished learning is offered without reducing completion stars or bypassing release locks', () => {
  const state = createSession({ runId: 'recent', stage: 1, phraseCount: 12, mode: 'manual', rate: 1 });
  const records = [{ stage: 1, count: 3, session: state }, { stage: 2, count: 1, session: { ...state, stage: 2 as const } }];
  assert.equal(stageOverview(records, 1).current, 1);
  assert.equal(stageOverview(records, 1).completed, 1);
  assert.equal(stageOverview(records, 11, true).current, 2);
  records[0]!.count = 0;
  assert.equal(stageOverview(records, 2).current, 1);
  assert.equal(stageOverview(records, 2, true).current, 2);
});

test('stars fill once per completed full run, cap at the requirement, and ignore partial cycles', () => {
  const session = createSession({ runId: 'partial', stage: 1, phraseCount: 12, mode: 'manual', rate: 1 });
  session.confirmed = 2;
  assert.deepEqual(stageStars({ stage: 1, count: 0, session }), [false, false, false]);
  assert.deepEqual(stageStars({ stage: 1, count: 1, session }), [true, false, false]);
  assert.deepEqual(stageStars({ stage: 10, count: 2, session: null }), [true, true, false]);
  assert.deepEqual(stageStars({ stage: 11, count: 2, session: null }), [true, true, false]);
  assert.deepEqual(stageStars({ stage: 16, count: 3, session: null }), [true, true, true]);
  assert.deepEqual(stageStars({ stage: 16, count: 9, session: null }), [true, true, true]);
});

test('all sixteen stages need three full runs, retaining existing counts without mutation', () => {
  const records = Array.from({ length: 16 }, (_, index) => Object.freeze({ stage: index + 1, count: 2, session: null }));
  for (const record of records) {
    assert.deepEqual(stageStars(record), [true, true, false]);
    assert.equal(stageComplete(record), false);
    const finished = { ...record, count: 3 };
    assert.deepEqual(stageStars(finished), [true, true, true]);
    assert.equal(stageComplete(finished), true);
    assert.equal(record.count, 2);
  }
  assert.deepEqual(stageOverview(records), { completed: 0, total: 16, percent: 0, current: 1 });
  assert.deepEqual(stageOverview(records.map(record => ({ ...record, count: 3 }))),
    { completed: 16, total: 16, percent: 100, current: 1 });
});
