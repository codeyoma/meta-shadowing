import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProgressBackupStore, validateProgressBackup, type BackupDatabase } from './progress-backup';
import { transition } from './session';
import { createLegacySession as createSession } from '../../tests/legacy-session';
import { Journal } from './journal';
import { Player } from './player';

test('version two round-trips partial cycle credit and the next confirmation earns only one', async t => {
  const a = sqlite(), b = sqlite(); t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now), target = new ProgressBackupStore(b.db, now);
  const audio = { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} };
  const player = new Player(session(), audio, state => source.journal.save('sample-v1', state, { book: 'sample', language: 'english' }), () => 0, () => {});
  await player.resume();
  player.audioEnded(1); await player.confirm();
  player.audioEnded(1); await player.confirm();
  player.audioEnded(1); await player.choose('repeat');
  const payload = source.exportBackup();
  assert.equal(JSON.parse(payload).version, 4);
  target.restoreBackup(payload); target.restoreBackup(payload);
  assert.equal(target.journal.progress.summary('english').xp, 3);
  const restored = new Player(target.journal.load('sample-v1', 1, 1)!, audio,
    state => target.journal.save('sample-v1', state, { book: 'sample', language: 'english' }), () => 0, () => {});
  await restored.resume(); restored.audioEnded(1); await restored.confirm();
  assert.equal(target.journal.progress.summary('english').xp, 4);
});

function sqlite() {
  const native = new DatabaseSync(':memory:');
  const db: BackupDatabase = {
    exec: sql => native.exec(sql),
    run: (sql, ...args) => { native.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).get(...args) as T | undefined,
    all: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).all(...args) as T[],
  };
  return { native, db };
}
const now = () => new Date('2026-09-12T12:00:00Z');
const session = () => createSession({ runId: 'finished', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });

// Historical SQLite rows are fixtures, not calls into the current reward path.
function legacyCompletion(store: ProgressBackupStore, db: BackupDatabase, run = 'finished', xp = 10) {
  store.journal.save('sample-v1', { ...session(), runId: run, confirmed: 3, phase: 'complete' });
  db.run('INSERT OR IGNORE INTO daily_stages VALUES (?,?,?,?)', 'en', 'sample', '2026-09-12', 1);
  db.run('INSERT INTO stage_awards VALUES (?,?,?,?,?,?)', 'en', 'sample', run, '2026-09-12', 1, xp);
  db.run('INSERT OR IGNORE INTO study_days VALUES (?,?)', 'en', '2026-09-12');
}

test('all learning preferences survive an idempotent SQLite backup and restore without adding XP', t => {
  const a = sqlite(), b = sqlite();
  t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now), target = new ProgressBackupStore(b.db, now);
  const settings = { mode: 'manual', rate: 1.25, speechView: 'list', groupSize: 4, crazyWpm: [175, 200, 250, 300] };
  source.saveValue('settings', JSON.stringify(settings));
  target.restoreBackup(source.exportBackup());
  assert.deepEqual(JSON.parse(target.readValue('settings')!), settings);
  assert.equal(target.journal.progress.summary('en').xp, 0);
  const revision = target.revision();
  target.restoreBackup(source.exportBackup());
  assert.equal(target.revision(), revision);
});

test('backup restores complete and unfinished practice once with original XP and study date', t => {
  const a = sqlite(), b = sqlite();
  t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now);
  legacyCompletion(source, a.db);
  source.journal.save('sample-v1', { ...session(), runId: 'unfinished', stage: 2, confirmed: 1, audioSeconds: 1.25, phase: 'listening', running: true });
  const target = new ProgressBackupStore(b.db, () => new Date('2026-09-13T12:00:00Z'));
  target.restoreBackup(source.exportBackup()); target.restoreBackup(source.exportBackup());
  assert.equal(target.journal.progress.summary('en').xp, 10);
  assert.equal(target.journal.progress.summary('en').streak, 1);
  assert.equal(target.journal.progress.daily('en', 'sample'), null);
  assert.equal(target.journal.completions('sample-v1', 1), 1);
  assert.equal(target.journal.load('sample-v1', 2, 1)?.audioSeconds, 1.25);
  assert.equal(target.journal.load('sample-v1', 2, 1)?.running, false);
});

test('backup rejects malformed schemas, duplicates, oversized input and inconsistent history', t => {
  const fixture = sqlite(); t.after(() => fixture.native.close());
  const store = new ProgressBackupStore(fixture.db, now);
  legacyCompletion(store, fixture.db);
  const valid = store.exportBackup();
  const corrupt = (edit: (data: any) => void) => { const data = JSON.parse(valid); edit(data); return JSON.stringify(data); };
  for (const payload of [
    '{', ' '.repeat(16 * 1024 * 1024 + 1),
    '한'.repeat(6 * 1024 * 1024),
    corrupt(b => { b.extra = true; }),
    corrupt(b => { b.tables.arbitrary_sql = []; }),
    corrupt(b => { b.tables.checkpoints[0].extra = 'secret'; }),
    corrupt(b => { b.tables.completions.push(b.tables.completions[0]); }),
    corrupt(b => { b.tables.completions[0].completed_at = '2026-02-30 12:00:00'; }),
    corrupt(b => { b.tables.completions[0].completed_at = '2026-09-12 24:00:00'; }),
    corrupt(b => { b.tables.stage_awards[0].day = '2026-02-30'; }),
    corrupt(b => { b.tables.stage_awards[0].xp = 20; }),
    corrupt(b => { b.tables.study_days = []; }),
    corrupt(b => { b.version = 3; delete b.sync; b.tables.daily_stages[0].stage = 2; }),
    corrupt(b => { b.tables.stage_awards[0].run = 'invented'; }),
    corrupt(b => { const s = JSON.parse(b.tables.checkpoints[0].state); s.phraseCount = 0; b.tables.checkpoints[0].state = JSON.stringify(s); }),
    corrupt(b => { const s = JSON.parse(b.tables.checkpoints[0].state); s.extra = true; b.tables.checkpoints[0].state = JSON.stringify(s); }),
    corrupt(b => { const s = JSON.parse(b.tables.checkpoints[0].state); s.stage = 2; b.tables.checkpoints[0].state = JSON.stringify(s); }),
    corrupt(b => { const s = JSON.parse(b.tables.checkpoints[0].state); s.audioSeconds = null; b.tables.checkpoints[0].state = JSON.stringify(s); }),
    corrupt(b => { b.tables.preferences = [{ key: 'settings', value: '{"mode":"manual","rate":4}' }]; }),
    corrupt(b => { b.tables.preferences = [{ key: 'selection', value: '{"language":"unknown","book":null}' }]; }),
    corrupt(b => { b.tables.preferences = [{ key: 'selection', value: '{"language":"english","book":null,"packageKey":"sample-v1"}' }]; }),
    corrupt(b => { b.tables.preferences = [{ key: 'purchase', value: '{}' }]; }),
    corrupt(b => { b.tables.preferences = [{ key: 'settings', value: '{"mode":"manual","rate":1,"owned":true}' }]; }),
  ]) assert.throws(() => validateProgressBackup(payload));
  assert.equal(validateProgressBackup(valid).version, 4);
});

test('durable revisions include preferences and journal saves; old acknowledgements leave newer work pending', t => {
  const fixture = sqlite(); t.after(() => fixture.native.close());
  const store = new ProgressBackupStore(fixture.db, now);
  assert.equal(store.pending(), false);
  assert.equal(store.hasData(), false);
  store.journal.save('sample-v1', session());
  const first = store.revision();
  store.saveValue('settings', '{"mode":"manual","rate":0.75}');
  assert.equal(store.revision(), first + 1);
  store.acknowledge(first);
  const reopened = new ProgressBackupStore(fixture.db, now);
  assert.equal(reopened.pending(), true);
  assert.equal(reopened.readValue('settings'), '{"mode":"manual","rate":0.75}');
  reopened.acknowledge(reopened.revision());
  reopened.acknowledge(first);
  assert.equal(reopened.pending(), false);
  assert.throws(() => reopened.acknowledge(reopened.revision() + 1));
  assert.equal(reopened.hasData(), true);
});

test('restore installs preferences atomically, marks a revision, and refuses divergent nonempty data', t => {
  const a = sqlite(), b = sqlite(); t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now), target = new ProgressBackupStore(b.db, now);
  source.journal.save('sample-v1', session());
  source.saveValue('settings', '{"mode":"manual","rate":0.75}');
  source.saveValue('selection', '{"language":"english","book":"sample","packageKey":"sample-v1"}');
  b.native.exec("CREATE TRIGGER deny_preferences BEFORE INSERT ON preferences BEGIN SELECT RAISE(ABORT, 'disk test'); END");
  const before = target.exportBackup();
  assert.throws(() => target.restoreBackup(source.exportBackup()));
  assert.equal(target.exportBackup(), before);
  assert.equal(target.revision(), 0);
  assert.equal(target.hasData(), false);
  b.native.exec('DROP TRIGGER deny_preferences');
  target.restoreBackup(source.exportBackup());
  assert.equal(target.readValue('settings'), source.readValue('settings'));
  assert.equal(target.readValue('selection'), source.readValue('selection'));
  assert.equal(target.pending(), true);
  const restoredRevision = target.revision();
  target.restoreBackup(source.exportBackup());
  assert.equal(target.revision(), restoredRevision);
  target.saveValue('settings', '{"mode":"manual","rate":2}');
  const divergent = target.exportBackup(), revision = target.revision();
  assert.throws(() => target.restoreBackup(source.exportBackup()), /nonempty/);
  assert.equal(target.exportBackup(), divergent);
  assert.equal(target.revision(), revision);
});

test('legacy completion history and zero-XP practice survive without inventing rewards', t => {
  const a = sqlite(), b = sqlite(); t.after(() => { a.native.close(); b.native.close(); });
  const legacy = new Journal(a.db, now);
  legacy.save('sample-v1', { ...session(), runId: 'legacy', confirmed: 3, phase: 'complete' });
  const source = new ProgressBackupStore(a.db, now);
  assert.equal(source.pending(), true);
  for (const runId of ['first', 'second', 'third']) legacyCompletion(source, a.db, runId, runId === 'third' ? 0 : 10);
  const target = new ProgressBackupStore(b.db, () => new Date('2026-09-13T12:00:00Z'));
  target.restoreBackup(source.exportBackup());
  assert.equal(target.journal.completions('sample-v1', 1), 4);
  assert.equal(target.journal.progress.summary('en').xp, 20);
  const backup = validateProgressBackup(target.exportBackup());
  assert.equal(backup.tables.stage_awards.length, 3);
  assert.equal(backup.tables.stage_awards.find(row => row.run === 'third')?.xp, 0);
  assert.equal(backup.tables.stage_awards.some(row => row.run === 'legacy'), false);
});

test('failure to increment backup revision rolls back checkpoint, reward and preference mutations', t => {
  const fixture = sqlite(); t.after(() => fixture.native.close());
  const store = new ProgressBackupStore(fixture.db, now);
  store.journal.save('sample-v1', session());
  store.saveValue('settings', '{"mode":"manual","rate":1}');
  store.acknowledge(store.revision());
  const original = store.exportBackup(), revision = store.revision();
  fixture.native.exec("CREATE TRIGGER deny_revision BEFORE UPDATE OF revision ON backup_state BEGIN SELECT RAISE(ABORT, 'disk test'); END");
  assert.throws(() => store.journal.save('sample-v1', { ...session(), confirmed: 3, phase: 'complete' }, { language: 'english', book: 'sample' }));
  assert.throws(() => store.saveValue('settings', '{"mode":"manual","rate":2}'));
  assert.equal(store.exportBackup(), original);
  assert.equal(store.revision(), revision);
  assert.equal(store.pending(), false);
  assert.equal(store.journal.completions('sample-v1', 1), 0);
  assert.equal(store.journal.progress.summary('en').xp, 0);
});

test('identical backup content remains idempotent when JSON property order changes', t => {
  const fixture = sqlite(); t.after(() => fixture.native.close());
  const store = new ProgressBackupStore(fixture.db, now);
  store.journal.save('sample-v1', session());
  store.saveValue('settings', '{"mode":"manual","rate":1}');
  const revision = store.revision();
  const backup = JSON.parse(store.exportBackup());
  const checkpoint = backup.tables.checkpoints[0];
  checkpoint.state = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(checkpoint.state)).reverse()));
  backup.tables.preferences[0].value = '{ "rate": 1, "mode": "manual" }';
  store.restoreBackup(JSON.stringify(backup));
  assert.equal(store.revision(), revision);
});

test('version one preserves legacy twenty XP and baselines partial history before the next real confirmation', async t => {
  const a = sqlite(), b = sqlite(); t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now), target = new ProgressBackupStore(b.db, now);
  legacyCompletion(source, a.db, 'old-a'); legacyCompletion(source, a.db, 'old-b');
  for (const table of ['stage_awards', 'daily_stages', 'study_days']) a.db.run(`UPDATE ${table} SET language='english'`);
  source.journal.save('sample-v1', { ...session(), runId: 'partial', confirmed: 1, phase: 'speaking', running: true });
  const legacy = JSON.parse(source.exportBackup()); legacy.version = 1; delete legacy.sync; delete legacy.tables.cycle_credits; delete legacy.tables.unit_credits;
  target.restoreBackup(JSON.stringify(legacy));
  assert.equal(target.journal.progress.summary('english').xp, 20);
  const player = new Player(target.journal.load('sample-v1', 1, 1)!,
    { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
    state => target.journal.save('sample-v1', state, { book: 'sample', language: 'english' }), () => 0, () => {});
  await player.resume(); await player.confirm();
  assert.equal(target.journal.progress.summary('english').xp, 21);
  assert.equal(target.journal.completions('sample-v1', 1), 2);
  assert.equal(JSON.parse(target.exportBackup()).version, 4);
  legacy.tables.stage_awards[0].xp = 11;
  assert.throws(() => validateProgressBackup(JSON.stringify(legacy)));
});

test('version two rejects corrupt credits and missing completion links before replacing any profile', async t => {
  const a = sqlite(), b = sqlite(); t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now), target = new ProgressBackupStore(b.db, now);
  const player = new Player(session(), { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
    state => source.journal.save('sample-v1', state, { book: 'sample', language: 'english' }), () => 0, () => {});
  await player.resume();
  for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
  player.audioEnded(1); await player.choose('next');
  const valid = source.exportBackup(), before = target.exportBackup();
  const changes = [
    (b: any) => { b.version = 5; },
    (b: any) => { b.tables.cycle_credits[0].credited = 4; },
    (b: any) => { b.tables.cycle_credits[0].credited = -1; },
    (b: any) => { b.tables.cycle_credits[0].confirmed = 4; b.tables.checkpoints = []; },
    (b: any) => { b.tables.cycle_credits[0].language = 'en'; },
    (b: any) => { b.tables.cycle_credits[0].book = 'other'; },
    (b: any) => { b.tables.cycle_credits[0].phrase_count = 2; },
    (b: any) => { b.tables.cycle_credits[0].day = ''; },
    (b: any) => { b.tables.cycle_credits.push(b.tables.cycle_credits[0]); },
    (b: any) => { b.tables.completions = []; },
    (b: any) => { b.tables.study_days = []; },
    (b: any) => { b.tables.cycle_credits[0].extra = 1; },
    (b: any) => { b.tables.cycle_credits = Array(100001).fill(b.tables.cycle_credits[0]); },
  ];
  for (const change of changes) {
    const broken = JSON.parse(valid); change(broken);
    assert.throws(() => target.restoreBackup(JSON.stringify(broken)));
    assert.equal(target.exportBackup(), before); assert.equal(target.revision(), 0);
  }
  target.restoreBackup(valid); target.restoreBackup(valid);
  assert.equal(target.journal.progress.summary('english').xp, 3);
  assert.equal(target.journal.progress.summary('english').streak, 1);
});

test('compact fifty-book forty-eight-run history fits backup bounds and round-trips', t => {
  const a = sqlite(), b = sqlite(); t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now), target = new ProgressBackupStore(b.db, now);
  const payload = JSON.parse(source.exportBackup());
  payload.version = 3; delete payload.sync;
  payload.tables.study_days.push({ language: 'english', day: '2026-09-12' });
  for (let book = 0; book < 50; book++) for (let stage = 1; stage <= 16; stage++) for (let run = 0; run < 3; run++) {
    const key = `book-${book}-v1`, id = `run-${book}-${stage}-${run}`;
    payload.tables.completions.push({ package: key, stage, run: id, completed_at: '2026-09-12 12:00:00' });
    payload.tables.cycle_credits.push({ package: key, stage, run: id, book: `book-${book}`, language: 'english',
      phrase_count: 500, phrase: 499, confirmed: 3, credited: 1500, day: '2026-09-12' });
  }
  const json = JSON.stringify(payload);
  assert.ok(Buffer.byteLength(json) < 1024 * 1024);
  target.restoreBackup(json);
  assert.equal(target.journal.progress.summary('english').xp, 3_600_000);
  assert.equal(validateProgressBackup(target.exportBackup()).tables.cycle_credits.length, 2400);
  target.restoreBackup(json);
  assert.equal(target.journal.progress.summary('english').xp, 3_600_000);
});

test('bounded ledger totals saturate at int32 while later confirmations and completion still persist', async t => {
  const a = sqlite(); t.after(() => a.native.close());
  const store = new ProgressBackupStore(a.db, now);
  const payload = JSON.parse(store.exportBackup());
  payload.version = 3; delete payload.sync;
  payload.tables.study_days.push({ language: 'english', day: '2026-09-12' });
  for (const run of ['large-a', 'large-b']) {
    payload.tables.completions.push({ package: 'sample-v1', stage: 1, run, completed_at: '2026-09-12 12:00:00' });
    payload.tables.cycle_credits.push({ package: 'sample-v1', stage: 1, run, book: 'sample', language: 'english',
      phrase_count: 100000, phrase: 99999, confirmed: 99999, credited: 2_147_483_647, day: '2026-09-12' });
  }
  const overflow = structuredClone(payload); overflow.tables.cycle_credits[0].credited = 2_147_483_648;
  assert.throws(() => validateProgressBackup(JSON.stringify(overflow)));
  store.restoreBackup(JSON.stringify(payload));
  assert.equal(store.journal.progress.summary('english').xp, 2_147_483_647);
  assert.equal(store.journal.progress.summary('english').level, 999);
  const player = new Player(session(), { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
    state => store.journal.save('sample-v1', state, { book: 'sample', language: 'english' }), () => 0, () => {});
  await player.resume();
  for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
  player.audioEnded(1); await player.choose('next');
  assert.equal(store.journal.progress.summary('english').xp, 2_147_483_647);
  assert.equal(store.journal.completions('sample-v1', 1), 3);
  assert.equal(validateProgressBackup(store.exportBackup()).tables.cycle_credits.find(row => row.run === 'finished')?.credited, 3);
});

test('backup revision failure rolls back a real final confirmation and retry adds exactly one', async t => {
  const a = sqlite(); t.after(() => a.native.close());
  const store = new ProgressBackupStore(a.db, now);
  const player = new Player(session(), { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
    state => store.journal.save('sample-v1', state, { book: 'sample', language: 'english' }), () => 0, () => {});
  await player.resume();
  for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
  player.audioEnded(1);
  const before = store.exportBackup(), revision = store.revision();
  a.db.exec("CREATE TRIGGER fail_cycle_revision BEFORE UPDATE OF revision ON backup_state BEGIN SELECT RAISE(ABORT,'full'); END");
  await player.choose('next');
  assert.equal(player.error, 'save');
  assert.equal(store.exportBackup(), before); assert.equal(store.revision(), revision);
  assert.equal(store.journal.progress.summary('english').xp, 2);
  assert.equal(store.journal.progress.summary('english').streak, 0);
  assert.equal(store.journal.completions('sample-v1', 1), 0);
  a.db.exec('DROP TRIGGER fail_cycle_revision'); player.retrySave(); player.retrySave();
  assert.equal(store.journal.progress.summary('english').xp, 3);
  assert.equal(store.journal.progress.summary('english').streak, 1);
  assert.equal(store.journal.completions('sample-v1', 1), 1);
});

test('locally saved legacy settings extras migrate to canonical backup without accepting external extras', t => {
  const a = sqlite(); t.after(() => a.native.close());
  const store = new ProgressBackupStore(a.db, now);
  const old = { ...session(), confirmed: 1, phase: 'speaking', speechView: 'text', groupSize: 3, crazyWpm: [200, 267, 333, 400] };
  a.db.run('INSERT INTO checkpoints VALUES (?,?,?)', 'sample-v1', 1, JSON.stringify(old));
  const exported = JSON.parse(store.exportBackup());
  const saved = JSON.parse(exported.tables.checkpoints[0].state);
  assert.equal(saved.confirmed, 1); assert.equal(saved.phase, 'speaking');
  assert.equal(Object.hasOwn(saved, 'crazyWpm'), false);
  exported.tables.checkpoints[0].state = JSON.stringify(old);
  assert.throws(() => validateProgressBackup(JSON.stringify(exported)));
});

test('an advanced snapshot for a displaced run cannot leave the checkpoint ahead of its credit frontier', t => {
  const a = sqlite(); t.after(() => a.native.close());
  const store = new ProgressBackupStore(a.db, now), identity = { book: 'sample', language: 'english' };
  store.journal.save('sample-v1', session(), identity);
  store.journal.save('sample-v1', { ...session(), runId: 'other' }, identity);
  const before = store.exportBackup(), revision = store.revision();
  assert.throws(() => store.journal.save('sample-v1', { ...session(), confirmed: 1 }, identity));
  assert.equal(store.exportBackup(), before); assert.equal(store.revision(), revision);
});

test('a displaced completed legacy run rejects an unproven earlier frontier without changing its backup', t => {
  const a = sqlite(); t.after(() => a.native.close());
  const store = new ProgressBackupStore(a.db, now), identity = { book: 'sample', language: 'english' };
  const initial = { ...session(), phraseCount: 2 };
  const completed = { ...initial, phrase: 1, confirmed: 3, phase: 'complete' as const };
  store.journal.save('sample-v1', completed);
  assert.equal(store.journal.load('sample-v1', 1, 2)?.phase, 'complete');
  store.journal.save('sample-v1', { ...initial, runId: 'other' });
  const checkpoint = store.journal.load('sample-v1', 1, 2);
  const before = store.exportBackup(), revision = store.revision();
  assert.throws(() => store.journal.save('sample-v1', initial, identity));
  assert.deepEqual(store.journal.load('sample-v1', 1, 2), checkpoint);
  assert.equal(store.revision(), revision); assert.equal(store.exportBackup(), before);
  assert.equal(store.journal.progress.summary('english').xp, 0);
  assert.equal(store.journal.completions('sample-v1', 1), 1);
  // A valid completed checkpoint can still be loaded/saved, without catch-up XP.
  store.journal.save('sample-v1', completed, identity);
  assert.equal(store.journal.load('sample-v1', 1, 2)?.phase, 'complete');
  assert.equal(validateProgressBackup(store.exportBackup()).tables.cycle_credits[0]?.credited, 0);
});

test('a stale three-cycle completion cannot replace the durable five-cycle completion frontier', async t => {
  const a = sqlite(); t.after(() => a.native.close());
  const store = new ProgressBackupStore(a.db, now), identity = { book: 'sample', language: 'english' };
  const player = new Player(session(), { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
    state => store.journal.save('sample-v1', state, identity), () => 0, () => {});
  await player.resume();
  for (let i = 0; i < 2; i++) { player.audioEnded(1); await player.confirm(); }
  player.audioEnded(1);
  const thirdSpeaking = { ...player.state };
  const thirdComplete = transition(thirdSpeaking, { type: 'next' });
  await player.choose('repeat');
  player.audioEnded(1); await player.confirm();
  player.audioEnded(1); await player.choose('next');
  assert.equal(store.journal.progress.summary('english').xp, 5);
  const checkpoint = store.journal.load('sample-v1', 1, 1);
  const before = store.exportBackup(), revision = store.revision();
  for (const owner of [identity, undefined]) {
    assert.throws(() => store.journal.save('sample-v1', thirdComplete, owner));
    assert.deepEqual(store.journal.load('sample-v1', 1, 1), checkpoint);
    assert.equal(store.revision(), revision); assert.equal(store.exportBackup(), before);
    assert.equal(store.journal.progress.summary('english').xp, 5);
  }
  // Stale unfinished copies retain credit history but cannot reopen a completed run.
  store.journal.save('sample-v1', thirdSpeaking, identity);
  assert.equal(store.journal.load('sample-v1', 1, 1), null);
  assert.equal(store.journal.progress.summary('english').xp, 5);
  assert.equal(validateProgressBackup(store.exportBackup()).tables.cycle_credits[0]?.confirmed, 5);
});
