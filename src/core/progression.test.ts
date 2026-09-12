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

function setup(file = ':memory:') {
  const db = new DatabaseSync(file);
  let now = new Date(2026, 8, 11, 12);
  const journal = new Journal({ exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null,
  }, () => now);
  const identity = { book: 'book-a', language: 'english' };
  const complete = (run: string, stage: 1 | 2 = 1, key = 'package-v1', owner = identity) => {
    const s = createSession({ runId: run, stage, phraseCount: 1, mode: 'manual', rate: 1 });
    journal.save(key, { ...s, confirmed: 3, phase: 'complete' }, owner);
  };
  return { db, journal, identity, complete, date: (day: number) => { now = new Date(2026, 8, day, 12); } };
}

test('completed runs award once, choose one stage per book/day and cap its repetitions', () => {
  const { db, journal, complete, date } = setup();
  try {
    complete('a'); complete('a'); complete('b', 2); complete('c'); complete('d');
    assert.equal(journal.progress.summary('english').xp, 20);
    assert.deepEqual(journal.progress.daily('english', 'book-a'), { stage: 1, awarded: 2, limit: 2 });
    date(12); complete('a');
    assert.equal(journal.progress.daily('english', 'book-a'), null);
    complete('e', 2); complete('f', 1);
    assert.equal(journal.progress.summary('english').xp, 30);
    assert.equal(journal.progress.summary('english').streak, 2);
  } finally { db.close(); }
});

test('disk reopen preserves daily eligibility, XP and completion history without replay rewards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-reward-test-'));
  let r = setup(join(dir, 'learning.db'));
  try {
    r.complete('a'); r.complete('b');
    r.db.close(); r = setup(join(dir, 'learning.db'));
    assert.equal(r.journal.progress.summary('english').xp, 20);
    assert.equal(r.journal.completions('package-v1', 1), 2);
    assert.deepEqual(r.journal.progress.daily('english', 'book-a'), { stage: 1, awarded: 2, limit: 2 });
    r.complete('a'); r.complete('c', 2); r.complete('d');
    assert.equal(r.journal.progress.summary('english').xp, 20);
    r.date(12); r.complete('e', 2);
    assert.equal(r.journal.progress.summary('english').xp, 30);
  } finally { r.db.close(); rmSync(dir, { recursive: true }); }
});

test('public player completion awards only after final Next and remains unique on restoration', async () => {
  const { db, journal, identity } = setup();
  const audio = { prepare: async () => {}, play: () => {}, pause: () => {}, position: () => 0, dispose: () => {} };
  const save = (state: ReturnType<typeof createSession>) => journal.save('package-v1', state, identity);
  try {
    const player = new Player(createSession({ runId: 'public-run', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 }), audio, save, () => 0, () => {});
    await player.resume();
    for (let i = 0; i < 3; i++) { player.audioEnded(1); await player.confirm(); }
    assert.equal(journal.progress.summary('english').xp, 0);
    await player.choose('next');
    assert.equal(journal.progress.summary('english').xp, 10);
    const restored = new Player(journal.load('package-v1', 1, 1)!, audio, save, () => 0, () => {});
    await restored.resume(); await restored.choose('next');
    assert.equal(journal.progress.summary('english').xp, 10);
    assert.equal(journal.completions('package-v1', 1), 1);
  } finally { db.close(); }
});

test('books and languages have separate allowances while versions keep the same book allowance', () => {
  const { db, journal, complete } = setup();
  try {
    complete('a'); complete('b', 2, 'package-v2');
    complete('c', 2, 'book-b-v1', { book: 'book-b', language: 'english' });
    complete('d', 1, 'japanese-v1', { book: 'book-a', language: 'japanese' });
    assert.equal(journal.progress.summary('english').xp, 20);
    assert.equal(journal.progress.summary('japanese').xp, 10);
    assert.equal(journal.progress.summary('french').xp, 0);
  } finally { db.close(); }
});

test('reward write failure rolls back the completion and checkpoint and retry awards once', () => {
  const { db, journal, complete } = setup();
  try {
    db.exec("CREATE TRIGGER deny_reward BEFORE INSERT ON stage_awards BEGIN SELECT RAISE(ABORT, 'full'); END;");
    assert.throws(() => complete('a'));
    assert.equal(journal.completions('package-v1', 1), 0);
    assert.equal(journal.load('package-v1', 1, 1), null);
    assert.equal(journal.progress.summary('english').xp, 0);
    db.exec('DROP TRIGGER deny_reward'); complete('a'); complete('a');
    assert.equal(journal.progress.summary('english').xp, 10);
  } finally { db.close(); }
});

test('unfinished and pre-existing completions never receive speculative XP', () => {
  const { db, journal, identity, complete } = setup();
  try {
    const s = createSession({ runId: 'old', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
    journal.save('package-v1', s, identity);
    assert.equal(journal.progress.summary('english').xp, 0);
    journal.save('package-v1', { ...s, confirmed: 3, phase: 'complete' });
    complete('old');
    assert.equal(journal.completions('package-v1', 1), 1);
    assert.equal(journal.progress.summary('english').xp, 0);
  } finally { db.close(); }
});

test('stages 11 through 16 allow three rewards and persisted zero-XP runs cannot earn on replay', () => {
  const { db, journal, identity, date } = setup();
  try {
    for (const run of ['a', 'b', 'c', 'd']) journal.progress.record({ ...identity, stage: 11, run });
    assert.equal(journal.progress.summary('english').xp, 30);
    assert.deepEqual(journal.progress.daily('english', identity.book), { stage: 11, awarded: 3, limit: 3 });
    date(12); journal.progress.record({ ...identity, stage: 11, run: 'd' });
    assert.equal(journal.progress.daily('english', identity.book), null);
    journal.progress.record({ ...identity, stage: 16, run: 'e' });
    assert.equal(journal.progress.summary('english').xp, 40);
    assert.throws(() => journal.progress.record({ ...identity, stage: 17, run: 'invalid' }));
    assert.throws(() => journal.progress.record({ ...identity, stage: 1, run: 'e' }));
    assert.equal(journal.progress.summary('english').xp, 40);
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

test('level progress advances exactly at thresholds, carries remainder and never stops at level 30', () => {
  assert.deepEqual(levelProgress(0), { level: 1, current: 0, required: 100 });
  assert.deepEqual(levelProgress(99), { level: 1, current: 99, required: 100 });
  assert.deepEqual(levelProgress(100), { level: 2, current: 0, required: 110 });
  assert.deepEqual(levelProgress(209), { level: 2, current: 109, required: 110 });
  assert.deepEqual(levelProgress(210), { level: 3, current: 0, required: 120 });
  assert.ok(levelProgress(100000).level > 30);
  assert.ok(Number.isFinite(levelProgress(Number.MAX_SAFE_INTEGER).required));
  for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => levelProgress(value));
  assert.equal(localDay(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.throws(() => localDay(new Date(NaN)));
});
