import test from 'node:test';
import assert from 'node:assert/strict';
import { videoPlayback, type VideoBridge, type VideoStatus } from './video-playback';
import { Player } from './player';
import { createSession, createGroupedSession } from './session';
import { DatabaseSync } from 'node:sqlite';
import { Journal } from './journal';
import { LearningContext } from './learning-context';
import { readVideoPackage } from './video-package';
import { presentLearningUnits } from './learning-presentation';
import { decodeSettings } from './settings';
import { lessonRemoteSnapshot, takeLessonRemoteAction } from './lesson-remote';
import { mainPlayerAction } from './player-presentation';

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
test('native interruption during preparation cancels resume without an audio error or late autoplay', async () => {
  const f = fixture();
  let resolve!: () => void, generation = 0, plays = 0, player: Player;
  f.bridge.prepare = (_owner, token) => { generation = token; return new Promise<void>(done => { resolve = done; }); };
  f.bridge.play = () => plays++;
  const port = videoPlayback('test', f.bridge, d => player.audioEnded(d), () => player.audioFailed(), () => player.pause());
  player = new Player(createSession({ runId: 'preparing', stage: 1, phraseCount: 2, rate: 1, mode: 'manual' }),
    port, () => {}, () => 0, () => {});
  const pending = player.resume();
  f.emit('paused', 0, generation);
  resolve();
  await pending;
  assert.equal(plays, 0);
  assert.equal(player.error, null);
  assert.equal(player.state.running, false);
  assert.equal(player.state.confirmed, 0);
  f.emit('ended', 2.5, generation);
  assert.equal(player.state.confirmed, 0);
  player.dispose();
});
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
test('wired video actions persist exactly five repeat credits and ignore unavailable or duplicate presses', async () => {
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
    const snapshot = (ready = true) => ({ owner: 'lesson', ...lessonRemoteSnapshot(player.state, player.error, ready) });
    const playing = snapshot();
    assert.equal(takeLessonRemoteAction(playing, { ...playing, action: 'main' }), null);
    assert.equal(takeLessonRemoteAction(playing, { ...playing, action: 'repeat' }), null);
    f.emit('playing', 0.75); f.emit('paused', 0.75);
    assert.equal(context.load(1)?.audioSeconds, 0.75);
    assert.equal(journal.progress.summary('english').xp, 0);
    const hidden = snapshot(false);
    assert.equal(takeLessonRemoteAction(hidden, { ...hidden, action: 'main' }), null);
    const paused = snapshot();
    assert.equal(mainPlayerAction(player.state, player.error), 'resume');
    assert.equal(takeLessonRemoteAction(paused, { ...paused, action: 'main' }), 'main');
    await player.resume();
    for (let cycle = 0; cycle < 5; cycle++) {
      f.emit('ended', 2.5);
      assert.equal(journal.progress.summary('english').xp, cycle);
      const gate = snapshot(), action = cycle === 2 ? 'repeat' : 'main';
      if (cycle !== 2) assert.equal(takeLessonRemoteAction(gate, { ...gate, action: 'repeat' }), null);
      assert.equal(takeLessonRemoteAction(gate, { ...gate, action }), action);
      assert.equal(takeLessonRemoteAction(gate, { ...gate, action }), null);
      if (cycle === 2) await player.choose('repeat');
      else if (cycle === 4) await player.choose('next');
      else await player.confirm();
      assert.equal(player.state.planned, cycle < 2 ? 3 : 5);
    }
    assert.equal(journal.progress.summary('english').xp, 5);
    assert.equal(context.completions(1), 1);
    assert.equal(context.load(1)?.phase, 'complete');
    player.dispose();
    assert.equal(context.save(context.load(1)!), 0);
    assert.equal(journal.progress.summary('english').xp, 5);
  } finally { db.close(); }
});

test('saved video groups preserve member counts, hints, pause checkpoints and explicit repeat rewards', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = new Journal({ exec: sql => db.exec(sql),
      run: (sql, ...args) => { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null });
    const phrases = ['Open the window.', 'Bring the cup.', 'Take a seat.', 'Read the book.', 'Close the door.'];
    const pack = readVideoPackage(JSON.stringify({ kind: 'video', schemaVersion: 1, id: 'video-groups', version: 1,
      title: 'Generated groups', media: { file: 'video/source.mp4', bytes: 10, sha256: 'a'.repeat(64), duration: 20 },
      phrases: phrases.map((text, i) => ({ id: `p${i}`, start: i * 3, end: i * 3 + 1, text, translation: `번역 ${i}` })) }))!;
    const context = new LearningContext(pack, journal);
    let settings = decodeSettings('{"mode":"manual","rate":1.5,"groupSize":3}');
    const initial = createGroupedSession({ ...settings, groupSize: settings.groupSize!, runId: 'group', stage: 9, sourcePhraseCount: 5 });
    context.save(initial);
    settings = decodeSettings('{"mode":"manual","rate":1,"groupSize":2}');
    const saved = context.load(9)!;
    assert.equal(settings.groupSize, 2);
    assert.deepEqual(context.units(saved).map(u => u.sourceIndices), [[0, 1, 2], [3, 4]]);
    assert.equal(saved.phraseCount, 2);
    assert.equal(saved.rate, 1.5);
    const four = createGroupedSession({ ...settings, groupSize: 4, runId: 'four', stage: 10, sourcePhraseCount: 5 });
    assert.deepEqual(context.units(four).map(u => u.sourceIndices), [[0, 1, 2, 3], [4]]);
    const shown = presentLearningUnits(context.units(saved), 9, null);
    assert.equal(shown[0]!.text, 'Open …\nBring …\nTake …');
    assert.deepEqual(shown[1]!.members, [
      { text: 'Read the book.', translation: '번역 3' }, { text: 'Close the door.', translation: '번역 4' }]);
    for (const stage of [2, 3, 4, 5, 6] as const) {
      const single = createSession({ runId: `single${stage}`, stage, phraseCount: 5, rate: 1, mode: 'manual' });
      const units = context.units(single);
      assert.deepEqual(units.map(u => u.sourceIndices), [[0], [1], [2], [3], [4]]);
      const presentation = presentLearningUnits(units, stage, null);
      assert.equal(presentation[0]!.text, stage >= 5 ? 'Open …' : 'Open the window.');
      assert.equal(presentation[0]!.translation, '번역 0');
    }
    const f = fixture();
    let player: Player;
    const port = videoPlayback('test', f.bridge, d => player.audioEnded(d), () => player.audioFailed(), () => player.pause());
    player = new Player(saved, port, context.createWriter(saved), () => 1000, () => {});
    await player.resume();
    f.emit('playing', 1.4); f.emit('failed', 1.4);
    assert.equal(context.load(9)!.audioSeconds, 1.4);
    assert.equal(player.state.phrase, 0);
    assert.equal(player.state.confirmed, 0);
    assert.equal(journal.progress.summary('english').xp, 0);
    await player.resume();
    for (let cycle = 0; cycle < 5; cycle++) {
      f.emit('ended', 2.5); f.emit('ended', 2.5);
      assert.equal(journal.progress.summary('english').xp, cycle * 3);
      if (cycle === 2) { await player.choose('repeat'); assert.equal(player.state.planned, 5); }
      else if (cycle === 4) await player.choose('next');
      else await player.confirm();
    }
    assert.equal(player.state.phrase, 1);
    assert.equal(journal.progress.summary('english').xp, 15);
    for (let cycle = 0; cycle < 3; cycle++) {
      f.emit('ended', 2.5); f.emit('ended', 2.5);
      assert.equal(journal.progress.summary('english').xp, 15 + cycle * 2);
      if (cycle === 2) await player.choose('next'); else await player.confirm();
    }
    assert.equal(journal.progress.summary('english').xp, 21);
    assert.equal(context.completions(9), 1);
    player.dispose();
    assert.equal(context.save(context.load(9)!), 0);
    assert.equal(journal.progress.summary('english').xp, 21);
  } finally { db.close(); }
});
