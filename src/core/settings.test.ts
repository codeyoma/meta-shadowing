import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSettings } from './settings';
import { validateValue } from './progress-backup-codec';

test('learning display and timing preferences survive saving and cloud validation', () => {
  const settings = { mode: 'manual', rate: 1.25, speechView: 'list', groupSize: 4, crazyWpm: [160, 210, 260, 310] };
  assert.deepEqual(decodeSettings(JSON.stringify(settings)), settings);
  assert.deepEqual(JSON.parse(validateValue('settings', JSON.stringify(settings))), settings);
});

test('independent learning sizes survive settings and backup validation without changing other preferences', () => {
  const settings = { mode: 'manual', rate: 1.25, speechView: 'list', groupSize: 4,
    crazyWpm: [150, 200, 250, 300], originalTextSize: 32, translationTextSize: 18 };
  assert.deepEqual(decodeSettings(JSON.stringify(settings)), settings);
  assert.deepEqual(JSON.parse(validateValue('settings', JSON.stringify(settings))), settings);
});

test('size preferences reject invalid persisted values and preserve legacy appearance when absent', () => {
  for (const key of ['originalTextSize', 'translationTextSize']) {
    for (const value of [11, 49, 20.5, '20', null, {}, true]) {
      const json = JSON.stringify({ mode: 'manual', rate: 1, [key]: value });
      assert.throws(() => decodeSettings(json));
      assert.throws(() => validateValue('settings', json));
    }
    for (const value of [12, 48]) {
      const settings = { mode: 'manual', rate: 1, [key]: value };
      assert.deepEqual(decodeSettings(JSON.stringify(settings)), settings);
    }
  }
  assert.deepEqual(decodeSettings('{"mode":"manual","rate":1}'), { mode: 'manual', rate: 1 });
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
