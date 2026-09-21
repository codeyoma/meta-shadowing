import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliderValue, sliderReleaseValue } from './slider-value';

const volume = { min: 0, max: 1, step: 0.05 };
const rate = { min: 0.25, max: 3, step: 0.25 };

test('release saves the last displayed volume, not a differing terminal event', () => {
  const displayed = sliderValue(0.64999998, volume);
  assert.equal(displayed, 0.65);
  assert.equal(sliderReleaseValue(displayed, 0.5, volume), 0.65);
  assert.equal(sliderReleaseValue(0, 0.5, volume), 0);
});

test('release saves the displayed playback step without reverting to the old rate', () => {
  const displayed = sliderValue(1.7499999, rate);
  assert.equal(displayed, 1.75);
  assert.equal(sliderReleaseValue(displayed, 1, rate), 1.75);
});

test('a release without a movement event still commits a valid step', () => {
  assert.equal(sliderReleaseValue(null, 0.5499999, volume), 0.55);
  assert.equal(sliderReleaseValue(null, 1.4999999, rate), 1.5);
});

test('displayed slider values stay within their allowed ranges', () => {
  assert.equal(sliderValue(-0.2, volume), 0);
  assert.equal(sliderValue(1.2, volume), 1);
  assert.equal(sliderValue(0, rate), 0.25);
  assert.equal(sliderValue(3.2, rate), 3);
});
