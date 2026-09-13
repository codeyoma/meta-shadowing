import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelProgress } from './progression';

test('bounded XP curve reaches level 999 at the approved threshold and carries surplus', () => {
  assert.equal(levelProgress(99).level, 1);
  assert.equal(levelProgress(100).level, 2);
  assert.equal(levelProgress(199).current, 99);
  assert.equal(levelProgress(200).level, 3);
  assert.equal(levelProgress(3_669_389).level, 998);
  assert.equal(levelProgress(3_669_390).level, 999);
  assert.equal(levelProgress(2_147_483_647).level, 999);
});

test('every threshold agrees with an independent exact rational rounding oracle', () => {
  let numerator = 100n, denominator = 1n, total = 0;
  for (let level = 1; level <= 998; level++) {
    const increment = Number((numerator + 5n * denominator) / (10n * denominator)) * 10;
    total += increment;
    assert.equal(levelProgress(total - 1).level, level);
    assert.equal(levelProgress(total).level, level + 1);
    numerator *= 10053n; denominator *= 10000n;
  }
  assert.equal(total, 3_669_390);
  for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => levelProgress(invalid));
  assert.deepEqual(levelProgress(Number.MAX_SAFE_INTEGER), levelProgress(2_147_483_647));
  const max = levelProgress(3_669_390);
  assert.ok(max.required > 0);
  assert.equal(max.current / max.required, 1);
});
