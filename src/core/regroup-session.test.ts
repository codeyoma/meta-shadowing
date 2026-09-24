import test from 'node:test';
import assert from 'node:assert/strict';
import * as sessions from './session';
import { regroupSession } from './regroup-session';
import { DatabaseSync } from 'node:sqlite';
import { ProgressBackupStore, type BackupDatabase } from './progress-backup';
import { LearningContext } from './learning-context';
import { jumpToSourcePhrase } from './session-navigation';
import { unitWeight } from './unit-credit';
import { validateProgressBackup } from './progress-backup';

function storage() {
  const db = new DatabaseSync(':memory:');
  const adapter: BackupDatabase = { exec: sql => db.exec(sql), run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T,
    all: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[] };
  return { db, store: new ProgressBackupStore(adapter) };
}
const pack = { language: 'english', manifest: { id: 'regroup-fixture', version: 1, title: 'Generated fixture',
  phrases: Array.from({ length: 8 }, (_, i) => ({ text: `Line ${i}.`, translation: '문장', file: `audio/${i}.m4a`, bytes: 1, sha256: 'a'.repeat(64) })) } };

test('changing a paused group size retains source cycles and restarts the current group only', () => {
  const initial = sessions.createGroupedSession({ runId: 'before', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1.5 });
  const paused = { ...initial, phrase: 1, confirmed: 1, audioSeconds: 2.5, phase: 'listening' as const,
    unitProgress: [{ confirmed: 3, planned: 3 }, { confirmed: 1, planned: 3 }, { confirmed: 0, planned: 3 }] };
  const next = regroupSession(paused, 4, 'after');
  assert.equal(next.version === 2 && next.groupSize, 4);
  assert.equal(next.phraseCount, 2);
  assert.equal(next.phrase, 0);
  assert.equal(next.audioSeconds, 0);
  assert.equal(next.running, false);
  assert.equal(next.rate, 1.5);
  assert.deepEqual(next.sourceProgress?.map(p => p.confirmed), [3, 3, 3, 1, 1, 1, 0, 0]);
  assert.deepEqual(next.unitProgress, [{ confirmed: 1, planned: 3 }, { confirmed: 0, planned: 3 }]);
  assert.deepEqual(sessions.restoreSession(JSON.stringify(next), 8, 9), next);
  assert.equal(regroupSession(next, 4, 'unused'), next);
  assert.throws(() => regroupSession({ ...paused, running: true }, 4, 'after'));
});

test('repeated regrouping retains optional cycles, completed sources and exact outstanding work', () => {
  const initial = sessions.createGroupedSession({ runId: 'optional', stage: 7, sourcePhraseCount: 8, groupSize: 2, mode: 'manual', rate: 1 });
  const paused = { ...initial, confirmed: 4, planned: 5, phase: 'ready' as const,
    unitProgress: [{ confirmed: 4, planned: 5 }, { confirmed: 3, planned: 3 }, { confirmed: 1, planned: 3 }, { confirmed: 0, planned: 3 }] };
  let s = regroupSession(paused, 4, 'four');
  const source = s.sourceProgress;
  s = regroupSession(s, 3, 'three');
  s = regroupSession(s, 2, 'two');
  assert.deepEqual(s.sourceProgress, source);
  assert.deepEqual(s.unitProgress, paused.unitProgress);
  let earned = 0;
  for (let passes = 0; s.phase !== 'complete' && passes < 12; passes++) {
    if (s.phase === 'decision') { s = sessions.transition(s, { type: 'next' }); continue; }
    s = sessions.transition(s, { type: 'resume' });
    s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 });
    earned += unitWeight(s, s.phrase);
    s = sessions.transition(s, { type: sessions.canChooseNext(s) ? 'next' : 'confirm' });
    s = sessions.restoreSession(JSON.stringify(s), 8, 7);
  }
  assert.equal(earned, 12);
  assert.equal(s.phase, 'complete');
  assert.deepEqual(s.sourceProgress?.map(p => p.confirmed), [5, 5, 3, 3, 3, 3, 3, 3]);
});

test('Repeat on a regrouped third cycle adds exactly two passes without corrupting source progress', () => {
  let s = regroupSession(sessions.createGroupedSession({ runId: 'initial', stage: 7, sourcePhraseCount: 8, groupSize: 2, mode: 'manual', rate: 1 }), 4, 'repeat');
  for (const type of ['confirm', 'confirm', 'repeat'] as const) {
    s = sessions.transition(s, { type: 'resume' });
    s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 });
    s = sessions.transition(s, { type });
    s = sessions.restoreSession(JSON.stringify(s), 8, 7);
  }
  assert.equal(s.confirmed, 3); assert.equal(s.planned, 5);
  assert.deepEqual(s.sourceProgress?.slice(0, 4), Array.from({ length: 4 }, () => ({ confirmed: 3, planned: 5 })));
  const other = jumpToSourcePhrase(s, 7);
  assert.equal(other.confirmed, 0); assert.equal(other.planned, 3);
  assert.deepEqual(jumpToSourcePhrase(other, 0), s);
});

test('invalid or stale regrouping leaves the durable checkpoint and XP intact', t => {
  const a = storage(); t.after(() => a.db.close());
  const context = new LearningContext(pack, a.store.journal);
  const s = sessions.createGroupedSession({ runId: 'existing', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  context.save(s);
  assert.throws(() => context.regroup(9, 'stale', 4, 'new'));
  a.db.exec("CREATE TEMP TRIGGER reject_regroup BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT,'fixture full disk'); END;");
  const before = a.store.exportBackup();
  assert.throws(() => context.regroup(9, 'existing', 4, 'new'), /fixture full disk/);
  assert.equal(a.store.exportBackup(), before);
  assert.deepEqual(context.load(9), s);
});

test('backups reject malformed per-source progress and invalid confirmation weights', t => {
  const a = storage(); t.after(() => a.db.close());
  const context = new LearningContext(pack, a.store.journal);
  let s = regroupSession(sessions.createGroupedSession({ runId: 'original', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 }), 4, 'changed');
  context.save(s);
  s = sessions.transition(s, { type: 'resume' }); s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 }); context.save(s);
  s = sessions.transition(s, { type: 'confirm' }); context.save(s);
  const payload = a.store.exportBackup();
  for (const weight of [0, 5, 1.5]) {
    const bad = JSON.parse(payload); bad.sync.runs[0].events[0].weight = weight;
    assert.throws(() => validateProgressBackup(JSON.stringify(bad)));
  }
  const bad = JSON.parse(payload), checkpoint = JSON.parse(bad.tables.checkpoints[0].state);
  checkpoint.sourceProgress[0].confirmed = 3;
  checkpoint.sourceProgress[0].planned = 1;
  bad.tables.checkpoints[0].state = JSON.stringify(checkpoint);
  assert.throws(() => validateProgressBackup(JSON.stringify(bad)));
});

test('changing between every group size during partial practice never duplicates source XP', t => {
  const a = storage(); t.after(() => a.db.close());
  const context = new LearningContext(pack, a.store.journal);
  let s = sessions.createGroupedSession({ runId: 'sequence', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  context.save(s);
  for (let step = 0; s.phase !== 'complete' && step < 30; step++) {
    const before = a.store.journal.progress.summary('english').xp;
    const size = ([2, 4, 3] as const)[step % 3]!;
    s = context.regroup(9, s.runId, size, `sequence-${step}`);
    assert.equal(a.store.journal.progress.summary('english').xp, before);
    if (s.phase !== 'decision') {
      s = sessions.transition(s, { type: 'resume' });
      s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 }); context.save(s);
    }
    s = sessions.transition(s, { type: sessions.canChooseNext(s) ? 'next' : 'confirm' }); context.save(s);
    validateProgressBackup(a.store.exportBackup());
  }
  assert.equal(s.phase, 'complete');
  assert.equal(a.store.journal.progress.summary('english').xp, 24);
  assert.equal(context.completions(9), 1);
});

for (const pinned of [false, true]) test(`regrouping retains XP and source confirmations through backup restoration (${pinned ? 'player writer' : 'direct save'})`, t => {
  const a = storage(), b = storage(); t.after(() => { a.db.close(); b.db.close(); });
  let context = new LearningContext(pack, a.store.journal);
  let s = sessions.createGroupedSession({ runId: 'old', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  context.save(s);
  const pass = () => {
    s = sessions.transition(s, { type: 'resume' });
    s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 }); context.save(s);
    s = sessions.transition(s, { type: 'confirm' }); context.save(s);
  };
  pass(); pass(); pass(); s = sessions.transition(s, { type: 'next' }); context.save(s); pass();
  assert.equal(a.store.journal.progress.summary('english').xp, 12);
  s = regroupSession(s, 4, 'new');
  assert.equal(context.save(s), 0);
  b.store.restoreBackup(a.store.exportBackup());
  context = new LearningContext(pack, b.store.journal);
  s = context.load(9)!;
  assert.equal(s.version === 2 && s.groupSize, 4);
  const write = pinned ? context.createWriter(s) : (state: sessions.Session) => context.save(state);
  const earnings: number[] = [];
  for (let i = 0; i < 5; i++) {
    s = sessions.transition(s, { type: 'resume' }); write(s);
    s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 }); write(s);
    s = sessions.transition(s, { type: sessions.canChooseNext(s) ? 'next' : 'confirm' }); earnings.push(write(s));
  }
  assert.deepEqual(earnings, [1, 1, 4, 4, 2]);
  assert.equal(s.phase, 'complete');
  assert.equal(b.store.journal.progress.summary('english').xp, 24);
  assert.equal(context.save(s), 0);
  a.store.mergeBackup(b.store.exportBackup());
  a.store.mergeBackup(b.store.exportBackup());
  assert.equal(a.store.journal.progress.summary('english').xp, 24);
  assert.equal(new LearningContext(pack, a.store.journal).completions(9), 1);
});
