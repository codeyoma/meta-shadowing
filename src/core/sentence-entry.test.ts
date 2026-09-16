import test from 'node:test';
import assert from 'node:assert/strict';
import { createSentenceEntry } from './sentence-entry';
const scope = { profile: 'local', packageKey: 'sample-v1', stage: 7, runId: 'run', phrase: 2 };
test('a selected sentence grants exactly one bounded entry for its saved scope', () => {
  let now = 0;
  const entry = createSentenceEntry(() => now);
  entry.request(scope);
  assert.equal(entry.consume(scope), true);
  assert.equal(entry.consume(scope), false);
  entry.request(scope); now = 30_001;
  assert.equal(entry.consume(scope), false);
});
test('wrong profile, package, stage, run, target and cancellation discard pending entry', () => {
  for (const patch of [{ profile: 'other' }, { packageKey: 'other' }, { stage: 8 }, { runId: 'other' }, { phrase: 1 }]) {
    const entry = createSentenceEntry(() => 0);
    entry.request(scope);
    assert.equal(entry.consume({ ...scope, ...patch }), false);
    assert.equal(entry.consume(scope), false);
  }
  const entry = createSentenceEntry(() => 0);
  entry.request(scope); entry.cancel();
  assert.equal(entry.consume(scope), false);
});
