import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeSettings, freshSettings } from './settings';
import { validateValue } from './progress-backup-codec';

test('independent built-in font choices survive settings and backup decoding without altering sizes', () => {
  const saved = { mode: 'manual', rate: 1.25, speechView: 'list', groupSize: 4,
    originalTextSize: 32, translationTextSize: 18, originalTextFont: 'serif', translationTextFont: 'apple-sd-gothic-neo' };
  assert.deepEqual(decodeSettings(JSON.stringify(saved)), saved);
  assert.deepEqual(JSON.parse(validateValue('settings', JSON.stringify(saved))), saved);
});

test('only curated identifiers are accepted and older backups do not silently customize fonts', () => {
  for (const field of ['originalTextFont', 'translationTextFont']) {
    for (const invalid of ['Helvetica', 'Nunito_800ExtraBold', '', 1, null, {}, ['system']]) {
      const json = JSON.stringify({ mode: 'manual', rate: 1, [field]: invalid });
      assert.throws(() => decodeSettings(json));
      assert.throws(() => validateValue('settings', json));
    }
    for (const choice of ['system', 'rounded', 'serif', 'avenir-next', 'georgia', 'apple-sd-gothic-neo']) {
      const saved = { mode: 'manual', rate: 1, [field]: choice };
      assert.deepEqual(JSON.parse(validateValue('settings', JSON.stringify(saved))), saved);
    }
  }
  const old = { mode: 'manual', rate: 1, originalTextSize: 20, translationTextSize: 18 };
  assert.deepEqual(JSON.parse(validateValue('settings', JSON.stringify(old))), old);
});

test('fresh profiles start with native System fonts while missing legacy choices remain absent', () => {
  assert.deepEqual(freshSettings(), { mode: 'manual', rate: 1, originalTextSize: 20, translationTextSize: 18,
    originalTextFont: 'system', translationTextFont: 'system' });
  assert.equal(decodeSettings('{"mode":"manual","rate":1}').originalTextFont, undefined);
});
