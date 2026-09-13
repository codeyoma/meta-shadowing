import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTapFeedback, allowsTapFeedback } from './tap-feedback';

test('option and settings routes are quiet while normal actions opt in by default', () => {
  for (const route of ['/settings', '/settings/learning', '/player-options', '/languages']) {
    assert.equal(allowsTapFeedback(route), false, route);
  }
  for (const route of ['/', '/lesson', '/player']) {
    assert.equal(allowsTapFeedback(route), true, route);
    assert.equal(allowsTapFeedback(route, false), false, route);
  }
});

test('one accepted tap starts only haptics without delaying the button action', () => {
  const events: string[] = [];
  const feedback = { active: () => true,
    haptic: () => { events.push('haptic'); return new Promise<void>(() => {}); },
    sound: () => { events.push('sound'); } };
  const tap = createTapFeedback(feedback);
  assert.equal(tap(), undefined);
  events.push('button action');
  assert.deepEqual(events, ['haptic', 'button action']);
});

test('excluded controls and inactive apps emit nothing; rapid taps do not stack haptics', () => {
  let count = 0, now = 1000, active = true;
  const tap = createTapFeedback({ active: () => active, haptic: () => { count++; } }, () => now);
  tap(false);
  active = false; tap();
  assert.equal(count, 0);
  active = true; tap(); tap();
  assert.equal(count, 1);
  now += 100; tap();
  assert.equal(count, 2);
});

test('unavailable haptics never prevent the button action', () => {
  const events: string[] = [];
  const tap = createTapFeedback({ active: () => true, haptic: () => { throw Error('haptics unavailable'); } });
  assert.doesNotThrow(() => { tap(); events.push('button action'); });
  assert.deepEqual(events, ['button action']);
});

test('asynchronous haptic failure remains quiet and later taps still work', async () => {
  let attempts = 0, now = 1000;
  const tap = createTapFeedback({ active: () => true,
    haptic: () => { attempts++; return Promise.reject(Error('haptics unavailable')); } }, () => now);
  assert.doesNotThrow(() => tap());
  await new Promise(resolve => setImmediate(resolve));
  now += 100;
  assert.doesNotThrow(() => tap());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
});
