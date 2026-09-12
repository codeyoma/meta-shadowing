import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTapFeedback, allowsTapFeedback, createTapSound } from './tap-feedback';

test('option and settings routes are quiet while normal actions opt in by default', () => {
  for (const route of ['/settings', '/settings/learning', '/player-options', '/languages']) {
    assert.equal(allowsTapFeedback(route), false, route);
  }
  for (const route of ['/', '/lesson', '/player']) {
    assert.equal(allowsTapFeedback(route), true, route);
    assert.equal(allowsTapFeedback(route, false), false, route);
  }
});

test('one accepted tap starts haptics and sound without waiting for either', () => {
  const events: string[] = [];
  const tap = createTapFeedback({ active: () => true,
    haptic: () => { events.push('haptic'); return new Promise<void>(() => {}); },
    sound: () => { events.push('sound'); return new Promise<void>(() => {}); } });
  assert.equal(tap(), undefined);
  events.push('button action');
  assert.deepEqual(events, ['haptic', 'sound', 'button action']);
});

test('player controls can retain haptics without starting any button sound', () => {
  const events: string[] = [];
  const tap = createTapFeedback({ active: () => true,
    haptic: () => { events.push('haptic'); }, sound: () => { events.push('sound'); } });
  tap(true, false);
  assert.deepEqual(events, ['haptic']);
});

test('excluded controls and inactive apps emit nothing; rapid taps do not stack sounds', () => {
  let count = 0, now = 1000, active = true;
  const tap = createTapFeedback({ active: () => active, haptic: () => { count++; }, sound: () => { count++; } }, () => now);
  tap(false);
  active = false; tap();
  assert.equal(count, 0);
  active = true; tap(); tap();
  assert.equal(count, 2);
  now += 100; tap();
  assert.equal(count, 4);
});

test('feedback failures remain quiet and never prevent the other feedback or button action', async () => {
  let sounds = 0;
  const tap = createTapFeedback({ active: () => true,
    haptic: () => { throw Error('haptics unavailable'); },
    sound: () => { sounds++; return Promise.reject(Error('audio unavailable')); } });
  assert.doesNotThrow(() => tap());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sounds, 1);
});

test('backgrounding during a sound seek cancels late playback and releases the old handle', async () => {
  let finishSeek!: () => void, plays = 0, releases = 0, creates = 0;
  const sound = createTapSound(() => {
    creates++;
    return { loaded: () => true, seek: () => new Promise<void>(resolve => { finishSeek = resolve; }),
      play: () => { plays++; }, release: () => { releases++; } };
  });
  sound.activate(); sound.activate();
  assert.equal(creates, 1);
  const pending = sound.play();
  sound.deactivate();
  sound.activate();
  finishSeek(); await pending;
  assert.equal(plays, 0);
  assert.equal(releases, 1);
  assert.equal(creates, 2);
});

test('unloaded feedback is skipped and concurrent taps share no pending seek queue', async () => {
  let loaded = false, seeks = 0, plays = 0, finishSeek!: () => void;
  const sound = createTapSound(() => ({ loaded: () => loaded,
    seek: () => { seeks++; return new Promise<void>(resolve => { finishSeek = resolve; }); },
    play: () => { plays++; }, release: () => {} }));
  sound.activate(); await sound.play();
  assert.equal(seeks, 0);
  loaded = true;
  const pending = sound.play(); await sound.play();
  assert.equal(seeks, 1);
  finishSeek(); await pending;
  assert.equal(plays, 1);
});
