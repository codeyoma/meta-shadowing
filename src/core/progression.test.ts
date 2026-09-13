import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal } from './journal';
import { Player } from './player';
import { createSession } from './session';
import { levelProgress, localDay } from './progression';
import { decodeSettings } from './settings';

test('explicit confirmation earns one XP before completion and retry cannot duplicate it', async () => {
  const { db, journal } = setup();
  try {
    const player = new Player(createSession({ runId: 'cycle', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 }),
      { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => journal.save('book-a-v1', state, { book: 'book-a', language: 'english' }), () => 0, () => {});
    await player.resume();
    player.audioEnded(1);
    assert.equal(journal.progress.summary('english').xp, 0);
    await player.confirm();
    assert.equal(journal.progress.summary('english').xp, 1);
    player.retrySave();
    assert.equal(journal.progress.summary('english').xp, 1);
  } finally { db.close(); }
});

function setup(file = ':memory:') {
  const db = new DatabaseSync(file);
  let now = new Date(2026, 8, 11, 12);
  const journal = new Journal({ exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null,
  }, () => now);
  const identity = { book: 'book-a', language: 'english' };
  const complete = (run: string, stage: 1 | 2 = 1, key = 'book-a-v1', owner = identity) => {
    const s = createSession({ runId: run, stage, phraseCount: 1, mode: 'manual', rate: 1 });
    journal.save(key, { ...s, confirmed: 3, phase: 'complete' }, owner);
  };
  return { db, journal, identity, complete, date: (day: number) => { now = new Date(2026, 8, day, 12); } };
}

test('unseen completed snapshots baseline zero XP and preserve completion streaks', () => {
  const { db, journal, complete, date } = setup();
  try {
    complete('a'); complete('a'); complete('b', 2); complete('c'); complete('d');
    assert.equal(journal.progress.summary('english').xp, 0);
    assert.equal(journal.progress.daily('english', 'book-a'), null);
    date(12); complete('a');
    assert.equal(journal.progress.daily('english', 'book-a'), null);
    complete('e', 2); complete('f', 1);
    assert.equal(journal.progress.summary('english').xp, 0);
    assert.equal(journal.progress.summary('english').streak, 2);
  } finally { db.close(); }
});

test('disk reopen preserves baseline completion history without replay rewards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-reward-test-'));
  let r = setup(join(dir, 'learning.db'));
  try {
    r.complete('a'); r.complete('b');
    r.db.close(); r = setup(join(dir, 'learning.db'));
    assert.equal(r.journal.progress.summary('english').xp, 0);
    assert.equal(r.journal.completions('book-a-v1', 1), 2);
    assert.equal(r.journal.progress.daily('english', 'book-a'), null);
    r.complete('a'); r.complete('c', 2); r.complete('d');
    assert.equal(r.journal.progress.summary('english').xp, 0);
    r.date(12); r.complete('e', 2);
    assert.equal(r.journal.progress.summary('english').xp, 0);
  } finally { r.db.close(); rmSync(dir, { recursive: true }); }
});

test('three public confirmations earn three XP and final decision Next only records completion', async () => {
  const { db, journal, identity } = setup();
  const audio = { prepare: async () => {}, play: () => {}, pause: () => {}, position: () => 0, dispose: () => {} };
  const save = (state: ReturnType<typeof createSession>) => journal.save('book-a-v1', state, identity);
  try {
    const player = new Player(createSession({ runId: 'public-run', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 }), audio, save, () => 0, () => {});
    await player.resume();
    for (let i = 0; i < 3; i++) { player.audioEnded(1); await player.confirm(); }
    assert.equal(journal.progress.summary('english').xp, 3);
    await player.choose('next');
    assert.equal(journal.progress.summary('english').xp, 3);
    const restored = new Player(journal.load('book-a-v1', 1, 1)!, audio, save, () => 0, () => {});
    await restored.resume(); await restored.choose('next');
    assert.equal(journal.progress.summary('english').xp, 3);
    assert.equal(journal.completions('book-a-v1', 1), 1);
  } finally { db.close(); }
});

test('unseen snapshots across versions and languages do not invent rewards', () => {
  const { db, journal, complete } = setup();
  try {
    complete('a'); complete('b', 2, 'book-a-v2');
    complete('c', 2, 'book-b-v1', { book: 'book-b', language: 'english' });
    complete('d', 1, 'japanese-v1', { book: 'japanese', language: 'japanese' });
    assert.equal(journal.progress.summary('english').xp, 0);
    assert.equal(journal.progress.summary('japanese').xp, 0);
    assert.equal(journal.progress.summary('french').xp, 0);
  } finally { db.close(); }
});

test('reward write failure rolls back the completion and checkpoint and retry awards once', () => {
  const { db, journal, complete } = setup();
  try {
    db.exec("CREATE TRIGGER deny_reward BEFORE INSERT ON cycle_credits BEGIN SELECT RAISE(ABORT, 'full'); END;");
    assert.throws(() => complete('a'));
    assert.equal(journal.completions('book-a-v1', 1), 0);
    assert.equal(journal.load('book-a-v1', 1, 1), null);
    assert.equal(journal.progress.summary('english').xp, 0);
    db.exec('DROP TRIGGER deny_reward'); complete('a'); complete('a');
    assert.equal(journal.progress.summary('english').xp, 0);
  } finally { db.close(); }
});

test('unfinished and pre-existing completions never receive speculative XP', () => {
  const { db, journal, identity, complete } = setup();
  try {
    const s = createSession({ runId: 'old', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
    journal.save('book-a-v1', s, identity);
    assert.equal(journal.progress.summary('english').xp, 0);
    journal.save('book-a-v1', { ...s, confirmed: 3, phase: 'complete' });
    complete('old');
    assert.equal(journal.completions('book-a-v1', 1), 1);
    assert.equal(journal.progress.summary('english').xp, 0);
  } finally { db.close(); }
});

test('historical stage eleven awards retain their old totals and daily record', () => {
  const { db, journal, identity, date } = setup();
  try {
    db.exec("INSERT INTO daily_stages VALUES ('english','book-a','2026-09-11',11)");
    for (const run of ['a', 'b', 'c', 'd']) db.prepare('INSERT INTO stage_awards VALUES (?,?,?,?,?,?)').run('english', 'book-a', run, '2026-09-11', 11, run === 'd' ? 0 : 10);
    assert.equal(journal.progress.summary('english').xp, 30);
    assert.deepEqual(journal.progress.daily('english', identity.book), { stage: 11, awarded: 3, limit: 3 });
    date(12);
    assert.equal(journal.progress.daily('english', identity.book), null);
    assert.equal(journal.progress.summary('english').xp, 30);
  } finally { db.close(); }
});

test('streak survives yesterday, resets after a missed day, and ignores future records', () => {
  const { db, journal, complete, date } = setup();
  try {
    complete('a'); date(12); complete('b');
    date(13); assert.equal(journal.progress.summary('english').streak, 2);
    date(14); assert.equal(journal.progress.summary('english').streak, 0);
    complete('c'); assert.equal(journal.progress.summary('english').streak, 1);
    date(11); assert.equal(journal.progress.summary('english').streak, 1);
    assert.equal(journal.progress.summary('japanese').streak, 0);
  } finally { db.close(); }
});

test('level progress carries remainder and never stops at level 30', () => {
  assert.deepEqual(levelProgress(0), { level: 1, current: 0, required: 100, maxLevel: false });
  assert.deepEqual(levelProgress(99), { level: 1, current: 99, required: 100, maxLevel: false });
  assert.deepEqual(levelProgress(100), { level: 2, current: 0, required: 100, maxLevel: false });
  assert.deepEqual(levelProgress(199), { level: 2, current: 99, required: 100, maxLevel: false });
  assert.deepEqual(levelProgress(200), { level: 3, current: 0, required: 100, maxLevel: false });
  assert.ok(levelProgress(100000).level > 30);
  assert.ok(Number.isFinite(levelProgress(Number.MAX_SAFE_INTEGER).required));
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => levelProgress(value));
  assert.equal(localDay(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.throws(() => localDay(new Date(NaN)));
});

test('unidentified snapshots persist without adding cycle XP', async () => {
  const { db, journal } = setup();
  try {
    let identify = true;
    const player = new Player(createSession({ runId: 'unbound', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 }),
      { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => journal.save('book-a-v1', state, identify ? { book: 'book-a', language: 'english' } : undefined), () => 0, () => {});
    await player.resume(); player.audioEnded(1);
    identify = false; await player.confirm();
    assert.equal(journal.progress.summary('english').xp, 0);
    assert.equal(journal.load('book-a-v1', 1, 1)?.confirmed, 1);
  } finally { db.close(); }
});

test('Repeat plus fourth and fifth cycles earn five; phrase Next reset and another three earn eight', async () => {
  const { db, journal, identity } = setup();
  try {
    const player = new Player(createSession({ runId: 'extra', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 }),
      { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => journal.save('book-a-v1', state, identity), () => 0, () => {});
    await player.resume();
    for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
    player.audioEnded(1); await player.choose('repeat');
    assert.equal(journal.progress.summary('english').xp, 3);
    player.audioEnded(1); await player.confirm();
    player.audioEnded(1); await player.choose('next');
    assert.equal(player.state.phrase, 1); assert.equal(player.state.confirmed, 0);
    assert.equal(journal.progress.summary('english').xp, 5);
    assert.equal(journal.progress.summary('english').streak, 0);
    for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
    player.audioEnded(1); await player.choose('next');
    assert.equal(journal.progress.summary('english').xp, 8);
    assert.equal(journal.completions('book-a-v1', 1), 1);
    assert.equal(journal.progress.summary('english').streak, 1);
    player.retrySave(); assert.equal(journal.progress.summary('english').xp, 8);
  } finally { db.close(); }
});

test('a failed final cycle rolls back checkpoint, XP, completion and streak then retries once', async () => {
  const { db, journal, identity } = setup();
  try {
    const player = new Player(createSession({ runId: 'failure', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 }),
      { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => journal.save('book-a-v1', state, identity), () => 0, () => {});
    await player.resume();
    for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
    player.audioEnded(1);
    const before = journal.load('book-a-v1', 1, 1);
    db.exec("CREATE TRIGGER deny_cycle BEFORE UPDATE ON cycle_credits BEGIN SELECT RAISE(ABORT,'full'); END");
    await player.choose('next');
    assert.equal(player.error, 'save');
    assert.deepEqual(journal.load('book-a-v1', 1, 1), before);
    assert.equal(journal.progress.summary('english').xp, 2);
    assert.equal(journal.completions('book-a-v1', 1), 0);
    assert.equal(journal.progress.summary('english').streak, 0);
    db.exec('DROP TRIGGER deny_cycle'); player.retrySave(); player.retrySave();
    assert.equal(journal.progress.summary('english').xp, 3);
    assert.equal(journal.completions('book-a-v1', 1), 1);
    assert.equal(journal.progress.summary('english').streak, 1);
  } finally { db.close(); }
});

test('legacy twenty XP and speaking checkpoint reopen without catch-up; next real confirmation earns twenty-one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cycle-migration-'));
  let r = setup(join(dir, 'learning.db'));
  try {
    r.db.exec("INSERT INTO daily_stages VALUES ('english','book-a','2026-09-11',1); INSERT INTO study_days VALUES ('english','2026-09-11')");
    for (const run of ['old-a', 'old-b']) {
      r.db.prepare('INSERT INTO completions(package,stage,run) VALUES (?,?,?)').run('book-a-v1', 1, run);
      r.db.prepare('INSERT INTO stage_awards VALUES (?,?,?,?,?,?)').run('english', 'book-a', run, '2026-09-11', 1, 10);
    }
    const old = { ...createSession({ runId: 'old-partial', stage: 1, phraseCount: 5, mode: 'manual', rate: 1 }), phrase: 4, confirmed: 1, phase: 'speaking', running: true,
      speechView: 'text', groupSize: 3, crazyWpm: [200, 267, 333, 400] };
    r.db.prepare('INSERT INTO checkpoints VALUES (?,?,?)').run('book-a-v1', 1, JSON.stringify(old));
    r.db.close(); r = setup(join(dir, 'learning.db'));
    assert.equal(r.journal.progress.summary('english').xp, 20);
    const player = new Player(r.journal.load('book-a-v1', 1, 5)!,
      { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => r.journal.save('book-a-v1', state, r.identity), () => 0, () => {});
    await player.resume(); assert.equal(r.journal.progress.summary('english').xp, 20);
    await player.confirm(); assert.equal(r.journal.progress.summary('english').xp, 21);
    r.db.close(); r = setup(join(dir, 'learning.db'));
    player.retrySave(); assert.equal(r.journal.progress.summary('english').xp, 21);
    assert.equal(r.journal.completions('book-a-v1', 1), 2);
  } finally { r.db.close(); rmSync(dir, { recursive: true }); }
});

test('stale speaking and duplicate confirmations never earn twice; skips baseline without XP', async () => {
  const { db, journal, identity } = setup();
  try {
    const initial = createSession({ runId: 'stale', stage: 1, phraseCount: 3, mode: 'manual', rate: 1 });
    const audio = { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} };
    const save = (state: typeof initial) => journal.save('book-a-v1', state, identity);
    const player = new Player(initial, audio, save, () => 0, () => {});
    await player.resume(); player.audioEnded(1);
    const stale = { ...player.state };
    await player.confirm(); player.retrySave();
    save(stale);
    const replay = new Player(stale, audio, save, () => 0, () => {});
    await replay.confirm(); assert.equal(journal.progress.summary('english').xp, 1);
    save({ ...initial, phrase: 2, confirmed: 2, phase: 'speaking', running: true });
    assert.equal(journal.progress.summary('english').xp, 1);
    assert.throws(() => save({ ...initial, phraseCount: 4 }));
    assert.throws(() => journal.save('book-a-v1', initial, { book: 'other', language: 'english' }));
    assert.throws(() => journal.save('book-a-v1', initial, { book: 'book-a', language: 'japanese' }));
    assert.throws(() => journal.save('book-a-v2', initial, { book: 'book-a', language: 'en' }));
    assert.equal(journal.progress.summary('english').xp, 1);
  } finally { db.close(); }
});

test('new runs, stages, books and package versions keep earning on the same day with language isolation', async () => {
  const { db, journal } = setup();
  try {
    const audio = { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} };
    for (const [run, stage, key, language, book] of [
      ['a', 1, 'book-a-v1', 'english', 'book-a'], ['b', 2, 'book-a-v1', 'english', 'book-a'],
      ['c', 1, 'book-a-v1', 'english', 'book-a'], ['d', 1, 'book-a-v2', 'english', 'book-a'],
      ['e', 1, 'book-b-v1', 'english', 'book-b'], ['f', 1, 'book-j-v1', 'japanese', 'book-j'],
    ] as const) {
      const player = new Player(createSession({ runId: run, stage, phraseCount: 1, mode: 'manual', rate: 1 }), audio,
        state => journal.save(key, state, { book, language }), () => 0, () => {});
      await player.resume();
      for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
      player.audioEnded(1); await player.choose('next');
    }
    assert.equal(journal.progress.summary('english').xp, 15);
    assert.equal(journal.progress.summary('japanese').xp, 3);
    assert.equal(journal.completions('book-a-v1', 1), 2);
    assert.equal(journal.completions('book-a-v1', 2), 1);
  } finally { db.close(); }
});

test('ordinary third-cycle Next across two phrases earns six and pause, rate, entry replay earn nothing', async () => {
  const { db, journal, identity } = setup();
  try {
    const initial = createSession({ runId: 'six', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
    const player = new Player(initial, { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => journal.save('book-a-v1', state, identity), () => 0, () => {});
    await player.resume(); player.pause(); player.state = { ...player.state, rate: 1.25 }; player.retrySave();
    assert.equal(journal.progress.summary('english').xp, 0);
    await player.resume(); player.audioEnded(1); player.pause(); await player.enter();
    assert.equal(player.state.phase, 'listening');
    assert.equal(journal.progress.summary('english').xp, 0);
    for (let phrase = 0; phrase < 2; phrase++) {
      for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
      player.audioEnded(1); await player.choose('next');
    }
    assert.equal(journal.progress.summary('english').xp, 6);
    assert.equal(journal.completions('book-a-v1', 1), 1);
  } finally { db.close(); }
});

test('native settings-derived sessions earn XP after SQLite serializes the settings array', async () => {
  const { db, journal, identity } = setup();
  try {
    const initial = createSession({ runId: 'native-settings', stage: 1, phraseCount: 1,
      ...decodeSettings('{"mode":"manual","rate":1,"speechView":"bubble","groupSize":3,"crazyWpm":[150,200,250,300]}') });
    const player = new Player(initial, { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => journal.save('book-a-v1', state, identity), () => 0, () => {});
    await player.resume(); player.audioEnded(1); await player.confirm();
    assert.equal(journal.progress.summary('english').xp, 1);
  } finally { db.close(); }
});
