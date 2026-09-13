import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSettings } from './settings';
import { validateValue } from './progress-backup-codec';

test('learning display and timing preferences survive saving and cloud validation', () => {
  const settings = { mode: 'manual', rate: 1.25, speechView: 'list', groupSize: 4, crazyWpm: [160, 210, 260, 310] };
  assert.deepEqual(decodeSettings(JSON.stringify(settings)), settings);
  assert.deepEqual(JSON.parse(validateValue('settings', JSON.stringify(settings))), settings);
});

test('invalid learning preferences are rejected rather than silently discarded', () => {
  for (const patch of [{ speechView: 'unknown' }, { groupSize: 1 }, { groupSize: 2.5 }, { groupSize: 5 },
    { crazyWpm: [150, 200, 250] }, { crazyWpm: [0, 200, 250, 300] }, { crazyWpm: [150, 200, 250, 1000] },
    { crazyWpm: [150, 200, 250, '300'] }]) {
    assert.throws(() => decodeSettings(JSON.stringify({ mode: 'manual', rate: 1, ...patch })));
  }
});

test('saved settings retain supported rates and migrate legacy automatic mode to manual', () => {
  assert.deepEqual(decodeSettings(null), { mode: 'manual', rate: 1 });
  for (const rate of [0.25, 0.3, 0.75, 1.25, 2.5, 3]) {
    assert.deepEqual(decodeSettings(JSON.stringify({ mode: 'auto', rate })), { mode: 'manual', rate });
  }
  for (const value of [{ mode: 'unknown', rate: 1 }, { mode: 'manual', rate: 0.24 }, { mode: 'manual', rate: 3.01 }, null]) {
    assert.throws(() => decodeSettings(JSON.stringify(value)));
  }
});
