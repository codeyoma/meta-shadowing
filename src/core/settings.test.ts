import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSettings } from './settings';

test('saved settings retain supported rates and migrate legacy automatic mode to manual', () => {
  assert.deepEqual(decodeSettings(null), { mode: 'manual', rate: 1 });
  for (const rate of [0.25, 0.3, 0.75, 1.25, 2.5, 3]) {
    assert.deepEqual(decodeSettings(JSON.stringify({ mode: 'auto', rate })), { mode: 'manual', rate });
  }
  for (const value of [{ mode: 'unknown', rate: 1 }, { mode: 'manual', rate: 0.24 }, { mode: 'manual', rate: 3.01 }, null]) {
    assert.throws(() => decodeSettings(JSON.stringify(value)));
  }
});
