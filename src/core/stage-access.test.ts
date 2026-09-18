import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTestStageAccess } from './stage-access';

test('only explicit native verification unlocks test-build stages', async () => {
  for (const [evidence, expected] of [[true, true], [false, false], [undefined, false], ['true', false], [1, false]]) {
    assert.equal(await resolveTestStageAccess(async () => evidence), expected);
  }
  assert.equal(await resolveTestStageAccess(), false);
  assert.equal(await resolveTestStageAccess(async () => { throw Error('StoreKit unavailable'); }), false);
});

test('unavailable native verification times out locked and cannot later change its answer', async () => {
  let finish!: (value: boolean) => void;
  const result = resolveTestStageAccess(() => new Promise(resolve => { finish = resolve; }), 5);
  assert.equal(await result, false);
  finish(true);
  assert.equal(await result, false);
});
