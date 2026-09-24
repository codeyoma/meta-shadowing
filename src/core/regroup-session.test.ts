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

test('Repeat after regrouping never reopens sources that were already complete', t => {
  const a = storage(); t.after(() => a.db.close());
  const context = new LearningContext(pack, a.store.journal);
  let s = sessions.createGroupedSession({ runId: 'repeat-mixed', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  context.save(s);
  const pass = (action: 'confirm' | 'repeat' = 'confirm') => {
    s = sessions.transition(s, { type: 'resume' });
    s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 }); context.save(s);
    s = sessions.transition(s, { type: action }); context.save(s);
  };
  pass(); pass(); pass();
  s = sessions.transition(s, { type: 'next' }); context.save(s);
  s = context.regroup(9, s.runId, 4, 'mixed');
  pass(); pass(); pass('repeat');
  s = context.load(9)!;
  assert.deepEqual(s.sourceProgress!.slice(0, 4).map(p => p.planned), [3, 3, 3, 5]);
  pass(); pass();
  assert.equal(a.store.journal.progress.summary('english').xp, 14);
  assert.deepEqual(s.sourceProgress!.slice(0, 4).map(p => p.confirmed), [3, 3, 3, 5]);
  validateProgressBackup(a.store.exportBackup());
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
  const initial = sessions.createGroupedSession({ runId: 'original', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  context.save(initial);
  let s = context.regroup(9, initial.runId, 4, 'changed');
  context.save(s);
  s = sessions.transition(s, { type: 'resume' }); s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 }); context.save(s);
  s = sessions.transition(s, { type: 'confirm' }); context.save(s);
  const payload = a.store.exportBackup();
  for (const weight of [0, 5, 1.5]) {
    const bad = JSON.parse(payload); bad.sync.runs.find((run: { run: string }) => run.run === 'changed').events[0].weight = weight;
    assert.throws(() => validateProgressBackup(JSON.stringify(bad)));
  }
  const bad = JSON.parse(payload), checkpoint = JSON.parse(bad.tables.checkpoints[0].state);
  checkpoint.sourceProgress[0].confirmed = 3;
  checkpoint.sourceProgress[0].planned = 1;
  bad.tables.checkpoints[0].state = JSON.stringify(checkpoint);
  assert.throws(() => validateProgressBackup(JSON.stringify(bad)));
  const original = a.store.exportBackup();
  for (const mutate of [
    (run: any) => { run.lineage = run.run; },
    (run: any) => { run.lineage = 'missing-root'; },
    (run: any) => { run.events[0].sources = []; },
    (run: any) => { run.events[0].sources[0].source = 7; },
    (run: any) => { run.events[0].sources[0].ordinal = 0; },
    (run: any) => { run.events[0].sources[1].source = run.events[0].sources[0].source; },
  ]) {
    const malformed = JSON.parse(original);
    mutate(malformed.sync.runs.find((run: { run: string }) => run.run === 'changed'));
    assert.throws(() => a.store.mergeBackup(JSON.stringify(malformed)));
    assert.equal(a.store.exportBackup(), original);
  }
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

for (const size of [2, 3, 4] as const) test(`concurrent regroup branches deduplicate source work against size ${size}`, t => {
  const a = storage(), b = storage(); t.after(() => { a.db.close(); b.db.close(); });
  const ca = new LearningContext(pack, a.store.journal), cb = new LearningContext(pack, b.store.journal);
  const initial = sessions.createGroupedSession({ runId: 'shared', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  ca.save(initial); b.store.restoreBackup(a.store.exportBackup());
  const left = ca.regroup(9, initial.runId, 4, 'left');
  const right = cb.regroup(9, initial.runId, size, 'right');
  const confirm = (context: LearningContext, state: sessions.Session) => {
    const write = context.createWriter(state);
    state = sessions.transition(state, { type: 'resume' }); write(state);
    state = sessions.transition(state, { type: 'audio-ended', durationSeconds: 1 }); write(state);
    state = sessions.transition(state, { type: 'confirm' }); write(state);
    return state;
  };
  const la = confirm(ca, left), rb = confirm(cb, right);
  assert.equal(a.store.journal.progress.summary('english').xp, 4);
  assert.equal(b.store.journal.progress.summary('english').xp, size);
  const backupA = a.store.exportBackup(), backupB = b.store.exportBackup();
  a.store.mergeBackup(backupB); b.store.mergeBackup(backupA);
  assert.equal(a.store.journal.progress.summary('english').xp, 4);
  assert.equal(b.store.journal.progress.summary('english').xp, 4);
  // Players already mounted during sync may still hold either predecessor.
  confirm(ca, la); confirm(cb, rb);
  a.store.mergeBackup(b.store.exportBackup()); b.store.mergeBackup(a.store.exportBackup());
  assert.equal(a.store.journal.progress.summary('english').xp, 8);
  assert.equal(b.store.journal.progress.summary('english').xp, 8);
  a.store.mergeBackup(b.store.exportBackup());
  assert.equal(a.store.journal.progress.summary('english').xp, 8);
});

test('nested regroup branches preserve mixed Repeat work and complete the shared lineage only once', t => {
  const a = storage(), b = storage(), restored = storage();
  t.after(() => [a, b, restored].forEach(device => device.db.close()));
  const ca = new LearningContext(pack, a.store.journal), cb = new LearningContext(pack, b.store.journal);
  const pass = (context: LearningContext, state: sessions.Session, action: 'confirm' | 'repeat' | 'next') => {
    state = sessions.transition(state, { type: 'resume' }); context.save(state);
    state = sessions.transition(state, { type: 'audio-ended', durationSeconds: 1 }); context.save(state);
    state = sessions.transition(state, { type: action }); context.save(state);
    return state;
  };
  let initial = sessions.createGroupedSession({ runId: 'nested-root', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  ca.save(initial);
  initial = pass(ca, initial, 'confirm'); initial = pass(ca, initial, 'confirm'); initial = pass(ca, initial, 'next');
  b.store.restoreBackup(a.store.exportBackup());
  ca.regroup(9, initial.runId, 2, 'left-parent');
  let left = ca.regroup(9, 'left-parent', 4, 'left-child');
  let right = cb.regroup(9, initial.runId, 2, 'right-child');
  const finish = (context: LearningContext, state: sessions.Session) => {
    state = pass(context, state, 'confirm'); state = pass(context, state, 'confirm'); state = pass(context, state, 'repeat');
    for (let guard = 0; state.phase !== 'complete' && guard < 30; guard++) {
      state = pass(context, state, state.phase === 'decision' || state.confirmed + 1 === state.planned ? 'next' : 'confirm');
    }
    assert.equal(state.phase, 'complete');
    return state;
  };
  left = finish(ca, left); right = finish(cb, right);
  assert.equal(a.store.journal.progress.summary('english').xp, 26);
  assert.equal(b.store.journal.progress.summary('english').xp, 26);
  const beforeA = a.store.exportBackup(), beforeB = b.store.exportBackup();
  a.store.mergeBackup(beforeB); b.store.mergeBackup(beforeA);
  assert.equal(a.store.journal.progress.summary('english').xp, 26);
  assert.equal(a.store.exportBackup(), b.store.exportBackup());
  restored.store.restoreBackup(a.store.exportBackup());
  assert.equal(restored.store.journal.progress.summary('english').xp, 26);
  assert.equal(ca.completions(9), 1);
  ca.save(sessions.createGroupedSession({ runId: 'independent', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 }));
  pass(ca, ca.load(9)!, 'confirm');
  assert.equal(a.store.journal.progress.summary('english').xp, 29, 'A genuinely new practice run earns independently');
});

test('a regrouped final decision cannot Repeat already completed sources', () => {
  let s = sessions.createGroupedSession({ runId: 'closed', stage: 7, sourcePhraseCount: 2, groupSize: 2, mode: 'manual', rate: 1 });
  for (let i = 0; i < 3; i++) {
    s = sessions.transition(s, { type: 'resume' });
    s = sessions.transition(s, { type: 'audio-ended', durationSeconds: 1 });
    s = sessions.transition(s, { type: 'confirm' });
  }
  s = regroupSession(s, 4, 'closed-regroup');
  assert.equal(sessions.canChooseRepeat(s), false);
  assert.equal(sessions.transition(s, { type: 'repeat' }), s);
  assert.equal(sessions.transition(s, { type: 'next' }).phase, 'complete');
});

test('regrouping migrated progress preserves opaque historical XP while deduplicating new source receipts', t => {
  const seed = storage(), a = storage(), b = storage();
  t.after(() => [seed, a, b].forEach(device => device.db.close()));
  const context = new LearningContext(pack, seed.store.journal);
  let initial = sessions.createGroupedSession({ runId: 'historical-root', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
  context.save(initial);
  const pass = (context: LearningContext, state: sessions.Session) => {
    state = sessions.transition(state, { type: 'resume' }); context.save(state);
    state = sessions.transition(state, { type: 'audio-ended', durationSeconds: 1 }); context.save(state);
    state = sessions.transition(state, { type: 'confirm' }); context.save(state);
    return state;
  };
  initial = pass(context, initial);
  const legacy = JSON.parse(seed.store.exportBackup()); legacy.version = 3; delete legacy.sync;
  a.store.restoreBackup(JSON.stringify(legacy)); b.store.restoreBackup(JSON.stringify(legacy));
  const ca = new LearningContext(pack, a.store.journal), cb = new LearningContext(pack, b.store.journal);
  pass(ca, ca.regroup(9, initial.runId, 4, 'legacy-left'));
  pass(cb, cb.regroup(9, initial.runId, 2, 'legacy-right'));
  const left = a.store.exportBackup(), right = b.store.exportBackup();
  a.store.mergeBackup(right); b.store.mergeBackup(left);
  assert.equal(a.store.journal.progress.summary('english').xp, 7);
  assert.equal(b.store.journal.progress.summary('english').xp, 7);
  assert.equal(a.store.exportBackup(), b.store.exportBackup());
});
