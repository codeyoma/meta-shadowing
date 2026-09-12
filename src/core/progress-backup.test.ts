import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProgressBackupStore, validateProgressBackup, type BackupDatabase } from './progress-backup';
import { createSession } from './session';
import { Journal } from './journal';

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

test('backup restores complete and unfinished practice once with original XP and study date', t => {
  const a = sqlite(), b = sqlite();
  t.after(() => { a.native.close(); b.native.close(); });
  const source = new ProgressBackupStore(a.db, now);
  source.journal.save('sample-v1', { ...session(), confirmed: 3, phase: 'complete' }, { language: 'en', book: 'sample' });
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
  store.journal.save('sample-v1', { ...session(), confirmed: 3, phase: 'complete' }, { language: 'en', book: 'sample' });
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
    corrupt(b => { b.tables.daily_stages[0].stage = 2; }),
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
  assert.equal(validateProgressBackup(valid).version, 1);
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
  for (const runId of ['first', 'second', 'third']) source.journal.save('sample-v1',
    { ...session(), runId, confirmed: 3, phase: 'complete' }, { language: 'en', book: 'sample' });
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
  assert.throws(() => store.journal.save('sample-v1', { ...session(), confirmed: 3, phase: 'complete' }, { language: 'en', book: 'sample' }));
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
