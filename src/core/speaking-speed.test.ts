import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeakingSpeeds, changeSpeakingSpeed, speakingSpeedRange } from './speaking-speed';

test('speaking speed editing uses five base choices and three relative choices', () => {
  assert.deepEqual(speakingSpeedRange([150, 200, 250, 300], 0), { min: 100, max: 200, step: 25 });
  assert.deepEqual(speakingSpeedRange([150, 200, 250, 300], 2), { min: 250, max: 350, step: 50 });
  assert.deepEqual(changeSpeakingSpeed([150, 200, 250, 300], 0, 190), [200, 250, 300, 350]);
  assert.deepEqual(changeSpeakingSpeed([150, 200, 250, 300], 1, 260), [150, 250, 300, 350]);
});

test('changing earlier speeds preserves following intervals without mutating saved values', () => {
  const saved: [number, number, number, number] = [150, 250, 400, 450];
  assert.deepEqual(changeSpeakingSpeed(saved, 0, 100), [100, 200, 350, 400]);
  assert.deepEqual(changeSpeakingSpeed(saved, 2, 300), [150, 250, 300, 350]);
  assert.deepEqual(saved, [150, 250, 400, 450]);
});

test('legacy custom values normalize for editing while decoded backups stay readable', () => {
  assert.deepEqual(normalizeSpeakingSpeeds([160, 210, 260, 310]), [150, 200, 250, 300]);
  assert.deepEqual(normalizeSpeakingSpeeds([1, 999, 1, 999]), [100, 250, 300, 450]);
  assert.deepEqual(normalizeSpeakingSpeeds(), [150, 200, 250, 300]);
  assert.deepEqual(changeSpeakingSpeed([150, 200, 250, 300], 0, 900), [200, 250, 300, 350]);
  assert.throws(() => changeSpeakingSpeed([150, 200, 250, 300], 4, 200));
  assert.throws(() => changeSpeakingSpeed([150, 200, 250, 300], 0, NaN));
});
