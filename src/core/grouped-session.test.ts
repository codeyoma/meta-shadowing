import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as sessions from './session';
import { LearningContext } from './learning-context';
import { ProgressBackupStore, validateProgressBackup, type BackupDatabase } from './progress-backup';

const input = { runId: 'group-run', stage: 9 as const, sourcePhraseCount: 5, groupSize: 2 as const, mode: 'manual' as const, rate: 1 };
const pack = { language: 'english', manifest: { id: 'group-book', version: 1, title: 'Group book', phrases:
  Array.from({ length: 5 }, (_, i) => ({ text: `Sentence ${i}.`, translation: '뜻', file: `audio/${i}.m4a`, bytes: 1, sha256: 'a'.repeat(64) })) } };
function storage() {
  const native = new DatabaseSync(':memory:');
  const db: BackupDatabase = { exec: sql => native.exec(sql), run: (sql, ...args) => { native.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).get(...args) as T,
    all: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).all(...args) as T[] };
  return { native, store: new ProgressBackupStore(db) };
}
test('grouped sessions explicitly freeze source count and plan, rejecting malformed or legacy reinterpretations', () => {
  assert.equal(typeof sessions.createGroupedSession, 'function');
  const s = sessions.createGroupedSession(input);
  assert.equal(s.version, 2); assert.equal(s.phraseCount, 3);
  assert.deepEqual(sessions.restoreSession(JSON.stringify(s), 5, 9), s);
  for (const patch of [{ version: 1 }, { sourcePhraseCount: 4 }, { groupSize: 1 }, { groupSize: 3 }, { phraseCount: 5 }, { stage: 5 }]) {
    assert.throws(() => sessions.restoreSession(JSON.stringify({ ...s, ...patch }), 5, 9));
  }
  assert.throws(() => sessions.createSession({ ...input, phraseCount: 5 }));
  for (const stage of [3, 4, 5, 6] as const) {
    const plain = sessions.createSession({ ...input, stage, phraseCount: 5 });
    assert.equal(sessions.restoreSession(JSON.stringify(plain), 5, stage).phraseCount, 5);
  }
});
test('SQLite and backup retain grouped unfinished cycles, immutable plans and idempotent rewards', t => {
  assert.equal(typeof sessions.createGroupedSession, 'function');
  const a = storage(), b = storage(); t.after(() => { a.native.close(); b.native.close(); });
  const context = new LearningContext(pack, a.store.journal);
  let s = sessions.createGroupedSession(input);
  context.save(s);
  s = sessions.transition(s, { type: 'resume' });
  s = sessions.transition(s, { type: 'audio-position', seconds: 2.25 }); context.save(s);
  a.store.saveValue('settings', JSON.stringify({ mode: 'manual', rate: 1, groupSize: 4 }));
  const paused = context.load(9)!;
  assert.equal(paused.audioSeconds, 2.25); assert.equal(paused.running, false); assert.equal(paused.confirmed, 0);
  assert.deepEqual(context.units(paused).map(u => u.sourceIndices), [[0, 1], [2, 3], [4]]);
  assert.throws(() => context.save(sessions.createGroupedSession({ ...input, groupSize: 3 })));
  assert.throws(() => new LearningContext({ ...pack, manifest: { ...pack.manifest, phrases: pack.manifest.phrases.slice(0, 4) } }, a.store.journal).load(9));
  const payload = a.store.exportBackup(); b.store.restoreBackup(payload);
  const restoredContext = new LearningContext(pack, b.store.journal);
  assert.deepEqual(restoredContext.load(9), paused);
  for (const patch of [{ groupSize: 1 }, { sourcePhraseCount: 0 }, { phraseCount: 2 }, { version: 1 }, { incidental: true }]) {
    const damaged = JSON.parse(payload); const row = damaged.tables.checkpoints[0];
    row.state = JSON.stringify({ ...JSON.parse(row.state), ...patch });
    assert.throws(() => validateProgressBackup(JSON.stringify(damaged)));
  }
  s = restoredContext.load(9)!;
  for (let unit = 0; unit < 3; unit++) {
    for (let cycle = 0; cycle < 3; cycle++) {
      s = sessions.transition(s, { type: 'resume' });
      s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 3 });
      restoredContext.save(s); assert.equal(restoredContext.completions(9), 0);
      s = sessions.transition(s, { type: 'confirm' }); restoredContext.save(s);
    }
    s = sessions.transition(s, { type: 'next' }); restoredContext.save(s);
  }
  restoredContext.save(s);
  assert.equal(restoredContext.completions(9), 1); assert.equal(b.store.journal.progress.summary('english').xp, 15);
  const c = storage(); t.after(() => c.native.close());
  c.store.restoreBackup(b.store.exportBackup());
  const finished = new LearningContext(pack, c.store.journal);
  assert.equal(finished.load(9)?.phase, 'complete'); assert.equal(finished.completions(9), 1);
});
