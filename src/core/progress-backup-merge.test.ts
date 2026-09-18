import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProgressBackupStore, validateProgressBackup, type BackupDatabase } from './progress-backup';
import { createSession, transition, type Session } from './session';
import { jumpToSourcePhrase } from './session-navigation';

function store(day = '2026-09-18T12:00:00Z') {
  const native = new DatabaseSync(':memory:');
  const db: BackupDatabase = {
    exec: sql => native.exec(sql),
    run: (sql, ...args) => { native.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).get(...args) as T | undefined,
    all: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).all(...args) as T[],
  };
  return { native, db, value: new ProgressBackupStore(db, () => new Date(day)) };
}
const identity = { book: 'sample', language: 'english' };
const initial = (runId: string) => createSession({ runId, stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
function confirm(s: Session, save: (state: Session) => number) {
  s = transition(s, { type: 'resume' }); save(s);
  s = transition(s, { type: 'audio-ended', durationSeconds: 1 }); save(s);
  s = transition(s, { type: 'confirm' }); save(s);
  return s;
}

test('independent offline learning merges once without lowering XP and converges in either order', t => {
  const a = store(), b = store(), c = store(); t.after(() => [a, b, c].forEach(s => s.native.close()));
  const one = initial('one'), two = initial('two');
  confirm(one, a.value.journal.createWriter('sample-v1', one, identity));
  confirm(two, b.value.journal.createWriter('sample-v1', two, identity));
  const left = a.value.exportBackup(), right = b.value.exportBackup();
  a.value.mergeBackup(right); b.value.mergeBackup(left);
  assert.equal(a.value.journal.progress.summary('english').xp, 2);
  assert.equal(b.value.journal.progress.summary('english').xp, 2);
  assert.equal(a.value.exportBackup(), b.value.exportBackup());
  const revision = a.value.revision(); a.value.mergeBackup(right);
  assert.equal(a.value.revision(), revision);
  c.value.restoreBackup(a.value.exportBackup());
  assert.equal(c.value.journal.progress.summary('english').xp, 2);
});

test('a pinned player keeps earning after a different remote run wins, while passive save cannot steal resume', t => {
  const a = store('2026-09-18T12:00:00Z'), b = store('2026-09-18T13:00:00Z'); t.after(() => [a, b].forEach(s => s.native.close()));
  let s = initial('local'); const write = a.value.journal.createWriter('sample-v1', s, identity);
  s = confirm(s, write);
  const remote = initial('remote'); confirm(remote, b.value.journal.createWriter('sample-v1', remote, identity));
  a.value.mergeBackup(b.value.exportBackup());
  assert.equal(a.value.journal.load('sample-v1', 1, 2)?.runId, 'remote');
  const revision = a.value.revision(); write({ ...s, running: false });
  assert.equal(a.value.revision(), revision);
  assert.equal(a.value.journal.load('sample-v1', 1, 2)?.runId, 'remote');
  s = confirm(s, write);
  assert.equal(a.value.journal.progress.summary('english').xp, 3);
  assert.equal(a.value.journal.load('sample-v1', 1, 2)?.runId, 'local');
  b.value.mergeBackup(a.value.exportBackup());
  assert.equal(b.value.journal.progress.summary('english').xp, 3);
});

test('shared-run three and five cycle branches preserve all confirmed XP and original completion days', t => {
  const a = store('2026-09-18T12:00:00Z'), b = store('2026-09-19T12:00:00Z'); t.after(() => [a, b].forEach(s => s.native.close()));
  let left = createSession({ runId: 'shared', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
  a.value.journal.save('sample-v1', left, identity); b.value.restoreBackup(a.value.exportBackup());
  let right = b.value.journal.load('sample-v1', 1, 1)!;
  const writeA = a.value.journal.createWriter('sample-v1', left, identity), writeB = b.value.journal.createWriter('sample-v1', right, identity);
  for (let i = 0; i < 3; i++) left = confirm(left, writeA);
  left = transition(left, { type: 'next' }); writeA(left);
  for (let i = 0; i < 3; i++) right = confirm(right, writeB);
  right = transition(right, { type: 'repeat' }); writeB(right);
  right = confirm(right, writeB);
  b.value.mergeBackup(a.value.exportBackup());
  assert.equal(b.value.journal.progress.summary('english').xp, 4);
  right = confirm(right, writeB);
  right = transition(right, { type: 'next' }); writeB(right);
  a.value.mergeBackup(b.value.exportBackup()); b.value.mergeBackup(a.value.exportBackup());
  assert.equal(a.value.journal.progress.summary('english').xp, 5);
  assert.equal(b.value.journal.progress.summary('english').xp, 5);
  assert.equal(b.value.journal.progress.summary('english').streak, 2);
  assert.equal(a.value.journal.completions('sample-v1', 1), 1);
  assert.equal(a.value.exportBackup(), b.value.exportBackup());
  const before = b.value.exportBackup(); b.value.mergeBackup(before); assert.equal(b.value.exportBackup(), before);
});

function legacySnapshot(empty: string, credited: number, counts: number[]) {
  const backup = JSON.parse(empty); backup.version = 3; delete backup.sync;
  const state = { ...initial('historical'), confirmed: counts[0]!, unitProgress: counts.map(confirmed => ({ confirmed, planned: 3 })) };
  backup.tables.checkpoints = [{ package: 'sample-v1', stage: 1, state: JSON.stringify(state) }];
  backup.tables.cycle_credits = [{ package: 'sample-v1', stage: 1, run: state.runId, ...identity, phrase_count: 2, phrase: 0, confirmed: counts[0], credited, day: '' }];
  backup.tables.unit_credits = [{ package: 'sample-v1', stage: 1, run: state.runId,
    state: JSON.stringify({ counts, sourceCount: 2, groupSize: 1, baseline: credited, earned: 0 }) }];
  return JSON.stringify(backup);
}

test('unequal migrated copies plus overlapping and distinct new evidence merge associatively with late v3 delivery', t => {
  const all = Array.from({ length: 5 }, () => store()); t.after(() => all.forEach(s => s.native.close()));
  const [a, b, x, y, z] = all.map(s => s.value) as [ProgressBackupStore, ProgressBackupStore, ProgressBackupStore, ProgressBackupStore, ProgressBackupStore];
  const empty = a.exportBackup(), oldA = legacySnapshot(empty, 1, [1, 0]), oldB = legacySnapshot(empty, 2, [2, 0]);
  a.restoreBackup(oldA); b.restoreBackup(oldB);
  let sa = a.journal.load('sample-v1', 1, 2)!, sb = b.journal.load('sample-v1', 1, 2)!;
  sa = confirm(sa, a.journal.createWriter('sample-v1', sa, identity));
  const writeB = b.journal.createWriter('sample-v1', sb, identity);
  sb = jumpToSourcePhrase(sb, 1); writeB(sb); sb = confirm(sb, writeB);
  const newA = a.exportBackup(), newB = b.exportBackup();
  x.mergeBackups([newA, newB, oldB]);
  y.mergeBackups([oldB, newA]); y.mergeBackup(newB);
  z.mergeBackups([newB, oldB]); z.mergeBackup(newA);
  assert.equal(x.journal.progress.summary('english').xp, 3);
  assert.equal(x.exportBackup(), y.exportBackup()); assert.equal(y.exportBackup(), z.exportBackup());
  a.mergeBackup(x.exportBackup()); assert.equal(a.journal.progress.summary('english').xp, 3);
  const revision = a.revision(); a.mergeBackup(oldA); a.mergeBackup(oldB); assert.equal(a.revision(), revision);
});

test('independent valid legacy daily awards survive merged caps and selected-stage differences', t => {
  const a = store(), b = store(); t.after(() => [a, b].forEach(s => s.native.close()));
  const history = (stage: number) => {
    const json = JSON.parse(a.value.exportBackup()); json.version = 3; delete json.sync;
    json.tables.daily_stages = [{ ...identity, day: '2026-09-18', stage }];
    json.tables.study_days = [{ language: identity.language, day: '2026-09-18' }];
    for (const n of [1, 2]) {
      const run = `legacy-${stage}-${n}`;
      json.tables.completions.push({ package: 'sample-v1', stage, run, completed_at: '2026-09-18 12:00:00' });
      json.tables.stage_awards.push({ ...identity, run, day: '2026-09-18', stage, xp: 10 });
    }
    return JSON.stringify(json);
  };
  const first = history(1), second = history(2);
  a.value.mergeBackups([first, second]); b.value.mergeBackups([second, first]);
  assert.equal(a.value.journal.progress.summary('english').xp, 40);
  assert.equal(a.value.exportBackup(), b.value.exportBackup());
  assert.equal(a.value.journal.completions('sample-v1', 1), 2);
  assert.equal(a.value.journal.completions('sample-v1', 2), 2);
});

test('a failed SQLite merge rolls back every record and revision then retry imports exactly once', t => {
  const a = store(), b = store(); t.after(() => [a, b].forEach(s => s.native.close()));
  const s = initial('remote'); confirm(s, b.value.journal.createWriter('sample-v1', s, identity));
  const remote = b.value.exportBackup(), before = a.value.exportBackup(), revision = a.value.revision();
  a.native.exec("CREATE TRIGGER fail_revision BEFORE UPDATE ON backup_state BEGIN SELECT RAISE(ABORT,'disk unavailable'); END;");
  assert.throws(() => a.value.mergeBackup(remote), /disk unavailable/);
  assert.equal(a.value.exportBackup(), before); assert.equal(a.value.revision(), revision);
  a.native.exec('DROP TRIGGER fail_revision');
  a.value.mergeBackup(remote); a.value.mergeBackup(remote);
  assert.equal(a.value.journal.progress.summary('english').xp, 1);
});

test('a batch containing an incompatible run plan never partially imports earlier valid records', t => {
  const a = store(), b = store(), c = store(); t.after(() => [a, b, c].forEach(s => s.native.close()));
  const one = initial('shared'), other = { ...initial('shared'), phraseCount: 3, unitProgress: Array.from({ length: 3 }, () => ({ confirmed: 0, planned: 3 })) };
  confirm(one, b.value.journal.createWriter('sample-v1', one, identity));
  confirm(other, c.value.journal.createWriter('sample-v1', other, identity));
  const before = a.value.exportBackup();
  assert.throws(() => a.value.mergeBackups([b.value.exportBackup(), c.value.exportBackup()]), /incompatible/i);
  assert.equal(a.value.exportBackup(), before); assert.equal(a.value.revision(), 0);
});

test('ordinary journal confirmations self-merge without changing the acknowledged revision', t => {
  const a = store(); t.after(() => a.native.close());
  const s = initial('ordinary');
  a.value.journal.save('sample-v1', s, identity);
  confirm(s, state => a.value.journal.save('sample-v1', state, identity));
  const snapshot = a.value.exportBackup(), revision = a.value.revision();
  a.value.acknowledge(revision); a.value.mergeBackup(snapshot);
  assert.equal(a.value.revision(), revision);
  assert.equal(a.value.pending(), false);
  assert.equal(a.value.exportBackup(), snapshot);
});

test('latest learning is independent of browsing selection and unchanged saves cannot promote it', t => {
  const a = store(); t.after(() => a.native.close());
  a.value.saveValue('selection', JSON.stringify({ language: 'english', book: 'browse', packageKey: 'browse-v1' }));
  const original = a.value.readValue('selection');
  const s = initial('learn'); const write = a.value.journal.createWriter('sample-v1', s, identity);
  const next = confirm(s, write);
  assert.equal(a.value.readValue('selection'), original);
  const learning = a.value.journal.latestLearning();
  assert.equal(learning?.packageKey, 'sample-v1'); assert.equal(learning?.stage, 1);
  assert.equal(learning?.language, 'english'); assert.equal(learning?.book, 'sample');
  a.value.saveValue('selection', JSON.stringify({ language: 'english', book: 'other', packageKey: 'other-v1' }));
  write(next); assert.deepEqual(a.value.journal.latestLearning(), learning);
});

test('study A then browse B retains learning A through merge orders and reopen until actual study B', t => {
  const a = store(), b = store(); t.after(() => [a, b].forEach(s => s.native.close()));
  const first = initial('book-a'); confirm(first, a.value.journal.createWriter('sample-v1', first, identity));
  a.value.saveValue('selection', JSON.stringify({ language: 'english', book: 'other', packageKey: 'other-v1' }));
  b.value.saveValue('settings', JSON.stringify({ mode: 'manual', rate: 1.25 }));
  const left = a.value.exportBackup(), right = b.value.exportBackup();
  a.value.mergeBackup(right); b.value.mergeBackup(left);
  assert.equal(a.value.exportBackup(), b.value.exportBackup());
  const reopened = new ProgressBackupStore(b.db);
  assert.equal(reopened.journal.latestLearning()?.packageKey, 'sample-v1');
  assert.equal(JSON.parse(reopened.readValue('selection')!).packageKey, 'other-v1');
  const second = initial('book-b'); confirm(second, reopened.journal.createWriter('other-v1', second, { ...identity, book: 'other' }));
  a.value.mergeBackup(reopened.exportBackup());
  assert.equal(a.value.journal.latestLearning()?.packageKey, 'other-v1');
  assert.equal(a.value.journal.progress.summary('english').xp, 2);
});

test('local monolithic-ledger migration is atomic and preserves evidence after a failed startup retry', t => {
  const a = store(); t.after(() => a.native.close());
  const first = initial('migration'); confirm(first, a.value.journal.createWriter('sample-v1', first, identity));
  const before = a.value.exportBackup(), revision = a.value.revision();
  // Previous local-storage layout fixture; the public backup format is unchanged.
  const legacyLedger = validateProgressBackup(before).sync;
  a.native.exec('DELETE FROM progress_sync_runs');
  a.db.run('UPDATE progress_sync_ledger SET state=?', JSON.stringify(legacyLedger));
  a.native.exec("CREATE TRIGGER fail_migration BEFORE INSERT ON progress_sync_runs BEGIN SELECT RAISE(ABORT,'migration unavailable'); END;");
  assert.throws(() => new ProgressBackupStore(a.db), /migration unavailable/);
  a.native.exec('DROP TRIGGER fail_migration');
  const migrated = new ProgressBackupStore(a.db);
  assert.equal(migrated.exportBackup(), before); assert.equal(migrated.revision(), revision);
  assert.equal(migrated.journal.progress.summary('english').xp, 1);
  migrated.mergeBackup(before); assert.equal(migrated.revision(), revision);
});

test('same historical receipt on different days keeps max awarded XP once and both completed study days', t => {
  const a = store(), b = store(); t.after(() => [a, b].forEach(s => s.native.close()));
  const receipt = (day: string, xp: number) => {
    const value = JSON.parse(a.value.exportBackup()); value.version = 3; delete value.sync;
    value.tables.completions = [{ package: 'sample-v1', stage: 1, run: 'old-shared', completed_at: `${day} 12:00:00` }];
    value.tables.daily_stages = [{ ...identity, day, stage: 1 }];
    value.tables.study_days = [{ language: identity.language, day }];
    value.tables.stage_awards = [{ ...identity, day, stage: 1, run: 'old-shared', xp }];
    return JSON.stringify(value);
  };
  const first = receipt('2026-09-17', 0), second = receipt('2026-09-18', 10);
  a.value.mergeBackups([first, second]); b.value.mergeBackups([second, first]);
  assert.equal(a.value.journal.progress.summary('english').xp, 10);
  assert.equal(a.value.journal.progress.summary('english').streak, 2);
  assert.equal(a.value.journal.completions('sample-v1', 1), 1);
  assert.equal(a.value.exportBackup(), b.value.exportBackup());
});
