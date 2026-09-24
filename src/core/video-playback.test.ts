import test from 'node:test';
import assert from 'node:assert/strict';
import { videoPlayback, type VideoBridge, type VideoStatus } from './video-playback';
import { Player } from './player';
import { createSession } from './session';
import { DatabaseSync } from 'node:sqlite';
import { Journal } from './journal';
import { LearningContext } from './learning-context';
import { readVideoPackage } from './video-package';

function fixture() {
  let listener: (s: VideoStatus) => void = () => {};
  let request = 0;
  const bridge: VideoBridge = {
    async prepare(_owner, generation) { request = generation; },
    play() {}, pause() {}, dispose() {},
    subscribe(fn) { listener = fn; return { remove() { listener = () => {}; } }; },
  };
  return { bridge, emit(phase: VideoStatus['phase'], position = 0, generation = request) {
    listener({ owner: 'test', generation, phase, position, duration: 2.5 });
  } };
}
test('decision entry restores its paused video frame without playback or additional credits', async () => {
  let frames = 0, plays = 0, saves = 0;
  const port = { async prepare() {}, play() { plays++; }, pause() {}, position: () => 0, dispose() {},
    async restoreFrame(phrase: number, rate: number) { assert.equal(phrase, 0); assert.equal(rate, 1); frames++; } };
  const state = { ...createSession({ runId: 'decision', stage: 1, phraseCount: 1, rate: 1, mode: 'manual' }),
    phase: 'decision' as const, confirmed: 3 };
  const player = new Player(state, port, () => saves++, () => 0, () => {});
  await player.enter();
  assert.equal(frames, 1);
  assert.equal(plays, 0); assert.equal(saves, 0);
  assert.equal(player.state, state);
});
test('video end enables explicit confirmation only once, without awarding playback XP', async () => {
  const f = fixture();
  let player: Player;
  const port = videoPlayback('test', f.bridge, d => player.audioEnded(d), () => player.audioFailed(), () => player.pause());
  player = new Player(createSession({ runId: 'run', stage: 1, phraseCount: 2, rate: 1, mode: 'manual' }), port, () => {}, () => 0, () => {});
  await player.resume();
  f.emit('playing', 1.25);
  assert.equal(port.position(), 1.25);
  f.emit('ended', 2.5);
  assert.equal(player.state.phase, 'speaking');
  assert.equal(player.state.confirmed, 0);
  f.emit('ended', 2.5);
  await player.confirm();
  assert.equal(player.state.confirmed, 1);
  assert.equal(player.state.phase, 'listening');
  player.dispose();
});
test('pausing cancels a pending seek and stale callbacks cannot finish replacement playback', async () => {
  const f = fixture();
  let resolve!: () => void, ended = 0;
  f.bridge.prepare = () => new Promise<void>(done => { resolve = done; });
  const port = videoPlayback('test', f.bridge, () => ended++, () => {}, () => {});
  const pending = port.prepare(0, 0.75, 1);
  const rejected = assert.rejects(pending);
  port.pause();
  await rejected;
  resolve();
  f.emit('ended', 2.5, 1);
  assert.equal(ended, 0);
  assert.equal(port.position(), 0.75);
  port.dispose();
});
test('a partial video failure pauses without confirmation and obsolete events cannot affect a replacement', async () => {
  const f = fixture();
  let player: Player;
  let firstGeneration = 0;
  f.bridge.prepare = async (_owner, generation) => { firstGeneration ||= generation; };
  const port = videoPlayback('test', f.bridge, d => player.audioEnded(d), () => player.audioFailed(), () => player.pause());
  player = new Player(createSession({ runId: 'failure', stage: 1, phraseCount: 1, rate: 1, mode: 'manual' }), port, () => {}, () => 0, () => {});
  await player.resume();
  f.emit('playing', 0.75, firstGeneration);
  f.emit('failed', 0.75, firstGeneration);
  assert.equal(player.error, 'audio'); assert.equal(player.state.running, false);
  assert.equal(player.state.audioSeconds, 0.75); assert.equal(player.state.confirmed, 0);
  await player.resume();
  f.emit('ended', 2.5, firstGeneration);
  assert.equal(player.state.phase, 'listening'); assert.equal(player.state.confirmed, 0);
  player.dispose();
  f.emit('failed', 0, firstGeneration);
  assert.equal(player.error, null);
});
test('video confirmations persist five repeat credits once and restore without additional rewards', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = new Journal({ exec: sql => db.exec(sql),
      run: (sql, ...args) => { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null });
    const pack = readVideoPackage(JSON.stringify({ kind: 'video', schemaVersion: 1, id: 'video-practice', version: 1,
      title: 'Video practice', media: { file: 'video/source.mp4', bytes: 10, sha256: 'a'.repeat(64), duration: 20 },
      phrases: [{ id: 'one', start: 10, end: 12.5, text: 'Hello.', translation: '안녕.' }] }))!;
    const context = new LearningContext(pack, journal), f = fixture();
    const initial = createSession({ runId: 'credits', stage: 1, phraseCount: 1, rate: 1, mode: 'manual' });
    let player: Player;
    const port = videoPlayback('test', f.bridge, d => player.audioEnded(d), () => player.audioFailed(), () => player.pause());
    player = new Player(initial, port, context.createWriter(initial), () => 1000, () => {});
    await player.resume();
    f.emit('playing', 0.75); player.pause();
    assert.equal(context.load(1)?.audioSeconds, 0.75);
    assert.equal(journal.progress.summary('english').xp, 0);
    await player.resume();
    for (let cycle = 0; cycle < 5; cycle++) {
      f.emit('ended', 2.5);
      assert.equal(journal.progress.summary('english').xp, cycle);
      if (cycle === 2) await player.choose('repeat');
      else if (cycle === 4) await player.choose('next');
      else await player.confirm();
    }
    assert.equal(journal.progress.summary('english').xp, 5);
    assert.equal(context.completions(1), 1);
    assert.equal(context.load(1)?.phase, 'complete');
    player.dispose();
    assert.equal(context.save(context.load(1)!), 0);
    assert.equal(journal.progress.summary('english').xp, 5);
  } finally { db.close(); }
});
