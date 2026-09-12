import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, type Session } from './session';
import { Player, type AudioPort } from './player';
import { audioPort, type NativeHandle, type NativeStatus } from './audio';

function rig() {
  let plays = 0, now = 0, failSave = false;
  const saved: Session[] = [];
  const positions: number[] = [];
  const audio: AudioPort = {
    prepare: async (_phrase, position) => { positions.push(position); },
    play: () => { plays++; }, pause: () => {}, position: () => 1.5, dispose: () => {},
  };
  const player = new Player(createSession({ runId: 'player', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 }),
    audio, state => { if (failSave) throw Error('disk full'); saved.push({ ...state }); }, () => now, () => {});
  return { player, audio, saved, positions, plays: () => plays,
    time: (n: number) => { now = n; }, fail: () => { failSave = true; }, recover: () => { failSave = false; } };
}

test('pause during asynchronous preparation never starts audio afterwards', async () => {
  const r = rig();
  let release!: () => void;
  r.audio.prepare = () => new Promise<void>(resolve => { release = resolve; });
  const start = r.player.resume();
  r.player.pause();
  release();
  await start;
  assert.equal(r.plays(), 0);
  assert.equal(r.player.state.running, false);
});

test('a new sentence is shown for one second before playback starts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.player.state = { ...r.player.state, phase: 'decision', confirmed: 3 };
  const next = r.player.choose('next');
  assert.equal(r.player.state.phrase, 1);
  assert.equal(r.plays(), 0);
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(r.plays(), 0);
  t.mock.timers.tick(1);
  await next;
  assert.equal(r.plays(), 1);
  assert.equal(r.player.state.confirmed, 0);
});

test('entering a restored speaking cycle plays it after one second without clearing completed checks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.player.state = { ...r.player.state, phase: 'speaking', confirmed: 1, audioSeconds: 2 };
  const entry = r.player.enter();
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(r.plays(), 0);
  assert.equal(r.player.state.confirmed, 1);
  t.mock.timers.tick(1);
  await entry;
  assert.equal(r.plays(), 1);
  assert.deepEqual(r.positions, [0]);
  assert.equal(r.player.state.phase, 'listening');
  assert.equal(r.player.state.confirmed, 1);
  assert.equal(r.saved.at(-1)?.confirmed, 1);
});

test('entering an interrupted listening cycle preserves its position and planned extra practice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.player.state = { ...r.player.state, phase: 'listening', confirmed: 3, planned: 5, audioSeconds: 1.2 };
  const entry = r.player.enter();
  t.mock.timers.tick(1000);
  await entry;
  assert.deepEqual(r.positions, [1.2]);
  assert.equal(r.player.state.confirmed, 3);
  assert.equal(r.player.state.planned, 5);
});

test('leaving during restored entry cancels audio; completed cycle decisions never autoplay', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  r.player.state = { ...r.player.state, phase: 'speaking', confirmed: 1 };
  const entry = r.player.enter();
  r.player.dispose();
  t.mock.timers.tick(1000);
  await entry;
  assert.equal(r.plays(), 0);
  assert.equal(r.saved.at(-1)?.confirmed, 1);
  for (const phase of ['decision', 'complete'] as const) {
    const done = rig();
    done.player.state = { ...done.player.state, phase, confirmed: 3 };
    await done.player.enter();
    assert.equal(done.plays(), 0);
    assert.equal(done.player.state.phase, phase);
    assert.equal(done.player.state.confirmed, 3);
  }
});

test('opening options or leaving during the sentence delay prevents late playback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const r = rig();
  const start = r.player.resume(1000);
  r.player.pause();
  t.mock.timers.tick(1000);
  await start;
  assert.equal(r.plays(), 0);
  assert.equal(r.positions.length, 0);
  assert.equal(r.saved.at(-1)?.running, false);
  assert.equal(r.player.state.confirmed, 0);
});

test('local-save failures stop playback; retry preserves the same unfinished position', async () => {
  const r = rig();
  await r.player.resume();
  assert.equal(r.plays(), 1);
  r.player.pause();
  assert.equal(r.saved.at(-1)?.audioSeconds, 1.5);
  r.fail();
  await r.player.resume();
  assert.equal(r.plays(), 1);
  assert.equal(r.player.state.running, false);
  assert.equal(r.player.error, 'save');
  r.recover();
  await r.player.resume();
  assert.equal(r.positions.at(-1), 1.5);
  assert.equal(r.player.error, null);
  assert.equal(r.plays(), 2);
});

test('manual confirmation starts the next cycle, while a third confirmation stops', async () => {
  const r = rig();
  await r.player.resume();
  for (let i = 0; i < 3; i++) {
    r.player.audioEnded(2);
    assert.equal(r.player.state.confirmed, i);
    await r.player.confirm();
  }
  assert.equal(r.plays(), 3);
  assert.equal(r.player.state.phase, 'decision');
  assert.equal(r.player.state.running, false);
});

test('repeat adds two cycles only once and cannot restart a five-cycle decision', async () => {
  const r = rig();
  await r.player.resume();
  for (let i = 0; i < 3; i++) { r.player.audioEnded(2); await r.player.confirm(); }
  await r.player.choose('repeat');
  assert.equal(r.player.state.confirmed, 3);
  assert.equal(r.player.state.planned, 5);
  for (let i = 0; i < 2; i++) { r.player.audioEnded(2); await r.player.confirm(); }
  const decision = { ...r.player.state };
  await r.player.choose('repeat');
  assert.deepEqual(r.player.state, decision);
  assert.equal(r.plays(), 5);
});

test('elapsed time cannot confirm practice, including a legacy automatic state', async () => {
  const r = rig();
  r.player.state = { ...r.player.state, mode: 'auto' };
  await r.player.resume();
  r.player.audioEnded(2);
  r.time(700);
  r.player.pause();
  assert.equal(r.player.state.confirmed, 0);
  r.time(90000);
  r.player.tick();
  assert.equal(r.player.state.confirmed, 0);
  await r.player.resume();
  r.time(92300);
  r.player.tick();
  await Promise.resolve();
  assert.equal(r.player.state.confirmed, 0);
  assert.equal(r.player.state.phase, 'speaking');
  await r.player.confirm();
  assert.equal(r.player.state.confirmed, 1);
});

test('save failure at the phrase boundary prevents the next audio from starting', async () => {
  const r = rig();
  await r.player.resume();
  for (let i = 0; i < 3; i++) { r.player.audioEnded(2); await r.player.confirm(); }
  r.fail();
  await r.player.choose('next');
  assert.equal(r.player.error, 'save');
  assert.equal(r.plays(), 3);
  r.recover(); r.player.retrySave(); await r.player.resume();
  assert.equal(r.player.state.phrase, 1);
  assert.equal(r.plays(), 4);
});

test('an audio failure saves a paused checkpoint and retries without confirming a cycle', async () => {
  const r = rig();
  await r.player.resume();
  r.player.audioFailed();
  assert.equal(r.player.error, 'audio');
  assert.equal(r.saved.at(-1)?.audioSeconds, 1.5);
  assert.equal(r.saved.at(-1)?.running, false);
  await r.player.resume();
  assert.equal(r.player.state.confirmed, 0);
  assert.equal(r.positions.at(-1), 1.5);
});

test('native interruption and media reset preserve the cycle and ignore callbacks from released handles', async () => {
  const callbacks: ((status: NativeStatus) => void)[] = [];
  const handles: NativeHandle[] = [];
  const saved: Session[] = [];
  let plays = 0;
  const status: NativeStatus = { isLoaded: true, playing: false, duration: 4, didJustFinish: false, error: null };
  const audio = audioPort(async () => {}, () => {
    const handle: NativeHandle = { currentTime: 0, duration: 4, currentStatus: status,
      setPlaybackRate: () => {}, seekTo: async value => { handle.currentTime = value; },
      play: () => { plays++; }, remove: () => {},
      onStatus: callback => { callbacks.push(callback); return { remove: () => {} }; },
    };
    handles.push(handle); return handle;
  }, duration => player.audioEnded(duration), () => player.audioFailed(), () => player.pause());
  const initial = { ...createSession({ runId: 'native-interrupted', stage: 2, phraseCount: 12, mode: 'manual', rate: 0.75 }),
    phrase: 6, confirmed: 3, planned: 5, phase: 'listening' as const, audioSeconds: 0.8 };
  const player = new Player(initial, audio, state => saved.push({ ...state }), () => 0, () => {});
  await player.resume();
  callbacks[0]!({ ...status, playing: true });
  handles[0]!.currentTime = 1.75;
  callbacks[0]!(status);
  assert.deepEqual(saved.at(-1), { ...initial, audioSeconds: 1.75 });
  callbacks[0]!({ ...status, playing: true });
  callbacks[0]!({ ...status, didJustFinish: true });
  assert.equal(player.state.phase, 'listening');
  assert.equal(player.state.running, false);
  assert.equal(plays, 1);
  await player.resume();
  assert.equal(handles[1]!.currentTime, 1.75);
  callbacks[1]!({ ...status, playing: true });
  callbacks[0]!({ ...status, error: 'late old handle failure' });
  assert.equal(player.error, null);
  assert.equal(player.state.running, true);
  handles[1]!.currentTime = 2.25;
  callbacks[1]!({ ...status, mediaServicesDidReset: true });
  assert.equal(player.error, 'audio');
  assert.deepEqual(saved.at(-1), { ...initial, audioSeconds: 2.25 });
  await player.resume();
  assert.equal(handles[2]!.currentTime, 2.25);
  assert.equal(player.state.confirmed, 3);
  assert.equal(plays, 3);
  player.dispose();
});
