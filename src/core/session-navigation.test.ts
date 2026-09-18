import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSession, createGroupedSession, transition, type Session } from './session';
import { ProgressBackupStore, type BackupDatabase } from './progress-backup';
import { completedUnitCount, jumpToSourcePhrase } from './session-navigation';
import { restoreSession } from './session';

function database() {
  const native = new DatabaseSync(':memory:');
  const db: BackupDatabase = { exec: sql => native.exec(sql),
    run: (sql, ...args) => { native.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).get(...args) as T,
    all: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).all(...args) as T[] };
  return { native, store: new ProgressBackupStore(db) };
}
const identity = { book: 'sample', language: 'english' };
const grouped = (size: 2 | 3 | 4 = 2) => createGroupedSession({ runId: 'navigation', stage: 7, sourcePhraseCount: 5, groupSize: size, mode: 'manual', rate: 1 });
function speaking(s: Session) { return transition(transition(s, { type: 'resume' }), { type: 'audio-ended', durationSeconds: 1 }); }

test('fresh sequential practice retains five optional cycles on the first backward jump', () => {
  let s = grouped();
  for (const type of ['confirm', 'confirm', 'repeat', 'confirm', 'next'] as const) s = transition(speaking(s), { type });
  s = jumpToSourcePhrase(s, 0);
  assert.equal(s.confirmed, 5);
  assert.equal(s.planned, 5);
});

test('fresh single-source practice retains optional cycles across advance, save and revisit', t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = createSession({ runId: 'single-navigation', stage: 5, phraseCount: 2, mode: 'manual', rate: 1 });
  const save = () => store.journal.save('sample-v1', s, identity);
  save();
  for (const type of ['confirm', 'confirm', 'repeat', 'confirm', 'next'] as const) {
    s = speaking(s); save(); s = transition(s, { type }); assert.equal(save(), 1);
  }
  s = jumpToSourcePhrase(store.journal.load('sample-v1', 5, 2)!, 0);
  assert.equal(s.confirmed, 5); assert.equal(s.planned, 5); assert.equal(save(), 0);
  assert.equal(store.journal.progress.summary('english').xp, 5);
});

test('fresh sequential practice earns weighted XP for extra cycles after its first backward jump', t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = grouped(); const save = () => store.journal.save('sample-v1', s, identity);
  save();
  for (const type of ['confirm', 'confirm', 'next'] as const) { s = speaking(s); save(); s = transition(s, { type }); assert.equal(save(), 2); }
  s = jumpToSourcePhrase(s, 0); assert.equal(save(), 0);
  s = transition(s, { type: 'repeat' }); save();
  s = speaking(s); save(); s = transition(s, { type: 'confirm' });
  assert.equal(save(), 2);
  assert.equal(save(), 0);
  assert.equal(store.journal.progress.summary('english').xp, 8);
});

test('group confirmations award original source count, including a short remainder, once', t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = grouped();
  const save = () => store.journal.save('sample-v1', s, identity);
  save(); s = speaking(s); save(); s = transition(s, { type: 'confirm' });
  assert.equal(save(), 2); assert.equal(save(), 0);
});

test('jumping to the last group and finishing it returns to a gap without completing the run', () => {
  let s = jumpToSourcePhrase(grouped(), 4);
  assert.equal(s.phrase, 2);
  for (let i = 0; i < 2; i++) s = transition(speaking(s), { type: 'confirm' });
  s = transition(speaking(s), { type: 'next' });
  assert.equal(s.phase, 'ready'); assert.equal(s.phrase, 0);
  s = jumpToSourcePhrase(s, 4);
  assert.equal(s.confirmed, 3); assert.equal(s.phase, 'decision');
});

test('forward skips then backward practice earn only explicit weighted confirmations and round-trip', t => {
  const a = database(), b = database(); t.after(() => { a.native.close(); b.native.close(); });
  let s = grouped(); const save = () => a.store.journal.save('sample-v1', s, identity);
  save(); s = jumpToSourcePhrase(s, 4); assert.equal(save(), 0);
  s = speaking(s); save(); s = transition(s, { type: 'confirm' }); assert.equal(save(), 1);
  s = jumpToSourcePhrase(s, 0); assert.equal(save(), 0);
  s = speaking(s); save(); s = transition(s, { type: 'confirm' }); assert.equal(save(), 2);
  assert.equal(save(), 0);
  b.store.restoreBackup(a.store.exportBackup());
  assert.equal(b.store.journal.progress.summary('english').xp, 3);
  assert.equal(b.store.journal.load('sample-v1', 7, 5)?.confirmed, 1);
});

for (const size of [2, 3, 4] as const) test(`size ${size} Repeat and final Next credit the origin and finish every unit`, t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = jumpToSourcePhrase(grouped(size), 4);
  const save = () => store.journal.save('sample-v1', s, identity);
  save();
  const weight = size === 3 ? 2 : 1;
  for (let i = 0; i < 2; i++) { s = speaking(s); save(); s = transition(s, { type: 'confirm' }); assert.equal(save(), weight); }
  s = speaking(s); save(); s = transition(s, { type: 'repeat' }); assert.equal(save(), weight);
  s = jumpToSourcePhrase(s, 0); save();
  assert.equal(completedUnitCount(s), 0);
  s = jumpToSourcePhrase(s, 4); save(); assert.equal(s.planned, 5); assert.equal(s.confirmed, 3);
  s = speaking(s); save(); s = transition(s, { type: 'confirm' }); assert.equal(save(), weight);
  s = speaking(s); save(); const stale = s;
  s = transition(s, { type: 'next' }); assert.equal(save(), weight);
  assert.equal(s.phrase, 0); assert.equal(store.journal.completions('sample-v1', 7), 0);
  assert.equal(store.journal.save('sample-v1', stale, identity), 0);
  assert.equal(store.journal.save('sample-v1', transition(stale, { type: 'next' }), identity), 0);
  while (s.phase !== 'complete') {
    s = speaking(s); save(); const final = s.confirmed + 1 === s.planned;
    s = transition(s, { type: final ? 'next' : 'confirm' }); save();
  }
  assert.equal(store.journal.completions('sample-v1', 7), 1);
  assert.equal(store.journal.progress.summary('english').xp, size === 3 ? 19 : 17);
  assert.doesNotThrow(() => store.exportBackup());
});

test('jump resets target audio but preserves checks and restores paused interruption', t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = jumpToSourcePhrase(grouped(), 3);
  s = transition(speaking(s), { type: 'confirm' });
  s = jumpToSourcePhrase(jumpToSourcePhrase(s, 0), 2);
  assert.equal(s.phrase, 1); assert.equal(s.confirmed, 1); assert.equal(s.running, false); assert.equal(s.audioSeconds, 0);
  s = transition(transition(s, { type: 'resume' }), { type: 'audio-position', seconds: 1.75 });
  store.journal.save('sample-v1', s, identity);
  const saved = store.journal.load('sample-v1', 7, 5)!;
  assert.equal(saved.audioSeconds, 1.75); assert.equal(saved.running, false); assert.equal(saved.confirmed, 1);
  for (const index of [-1, 5, 1.5, NaN]) assert.throws(() => jumpToSourcePhrase(saved, index));
  assert.throws(() => restoreSession(JSON.stringify({ ...saved, confirmed: 2 }), 5, 7));
});

test('a stale legacy checkpoint cannot reopen credit when navigation is first introduced', t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = grouped(); const save = () => store.journal.save('sample-v1', s, identity);
  save(); s = speaking(s); save(); const stale = s;
  s = transition(s, { type: 'confirm' }); assert.equal(save(), 2);
  s = stale; save(); s = jumpToSourcePhrase(s, 0); save();
  s = speaking(s); save(); s = transition(s, { type: 'confirm' });
  assert.equal(save(), 0); assert.equal(store.journal.progress.summary('english').xp, 2);
});

test('historical v2 XP stays unchanged and earlier legacy optional counts cannot be awarded again', t => {
  const a = database(), b = database(); t.after(() => { a.native.close(); b.native.close(); });
  let s = grouped(); delete s.unitProgress;
  const save = () => a.store.journal.save('sample-v1', s, identity);
  save();
  for (let i = 0; i < 3; i++) { s = speaking(s); save(); s = transition(s, { type: i === 2 ? 'next' : 'confirm' }); save(); }
  const legacy = JSON.parse(a.store.exportBackup()); legacy.version = 2; delete legacy.tables.unit_credits;
  legacy.tables.cycle_credits[0].credited = 3; // Historical one-XP group confirmations.
  b.store.restoreBackup(JSON.stringify(legacy));
  s = jumpToSourcePhrase(b.store.journal.load('sample-v1', 7, 5)!, 0);
  assert.equal(b.store.journal.save('sample-v1', s, identity), 0);
  s = transition(s, { type: 'repeat' }); b.store.journal.save('sample-v1', s, identity);
  s = speaking(s); b.store.journal.save('sample-v1', s, identity);
  s = transition(s, { type: 'confirm' }); assert.equal(b.store.journal.save('sample-v1', s, identity), 0);
  assert.equal(b.store.journal.progress.summary('english').xp, 3);
  assert.doesNotThrow(() => b.store.exportBackup());
});

test('large book navigation backups restore and reject inconsistent unit state and credit', t => {
  const a = database(), b = database(); t.after(() => { a.native.close(); b.native.close(); });
  const s = jumpToSourcePhrase(createGroupedSession({ runId: 'large', stage: 7, sourcePhraseCount: 12000, groupSize: 2, mode: 'manual', rate: 1 }), 11999);
  a.store.journal.save('sample-v1', s, identity);
  const payload = a.store.exportBackup(); assert.ok(payload.length > 4096);
  b.store.restoreBackup(payload); assert.equal(b.store.journal.load('sample-v1', 7, 12000)?.phrase, 5999);
  assert.equal(completedUnitCount(b.store.journal.load('sample-v1', 7, 12000)!), 0);
  for (const corrupt of [
    (v: any) => { const state = JSON.parse(v.tables.checkpoints[0].state); state.unitProgress.pop(); v.tables.checkpoints[0].state = JSON.stringify(state); },
    (v: any) => { const state = JSON.parse(v.tables.checkpoints[0].state); state.unitProgress[5999].confirmed = 1; v.tables.checkpoints[0].state = JSON.stringify(state); },
    (v: any) => { const state = JSON.parse(v.tables.unit_credits[0].state); state.counts[0] = -1; v.tables.unit_credits[0].state = JSON.stringify(state); },
    (v: any) => { const state = JSON.parse(v.tables.unit_credits[0].state); state.earned = 1; v.tables.unit_credits[0].state = JSON.stringify(state); },
    (v: any) => { v.tables.unit_credits = []; },
    (v: any) => { v.tables.cycle_credits = []; },
  ]) {
    const bad = JSON.parse(payload); corrupt(bad); assert.throws(() => b.store.restoreBackup(JSON.stringify(bad)));
  }
  assert.equal(b.store.exportBackup(), payload);
});

test('saving an unconfirmed speaking checkpoint repeatedly never earns XP', t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = jumpToSourcePhrase(grouped(), 4);
  store.journal.save('sample-v1', s, identity); s = speaking(s);
  assert.equal(store.journal.save('sample-v1', s, identity), 0);
  assert.equal(store.journal.save('sample-v1', s, identity), 0);
  assert.equal(store.journal.progress.summary('english').xp, 0);
});

test('direct final Next after backup restoration credits the paused speaking unit', t => {
  const a = database(), b = database(); t.after(() => { a.native.close(); b.native.close(); });
  let s = jumpToSourcePhrase(grouped(), 4);
  const save = () => a.store.journal.save('sample-v1', s, identity);
  save();
  for (let i = 0; i < 2; i++) { s = speaking(s); save(); s = transition(s, { type: 'confirm' }); save(); }
  s = speaking(s); save(); b.store.restoreBackup(a.store.exportBackup());
  s = b.store.journal.load('sample-v1', 7, 5)!;
  assert.equal(s.phase, 'speaking'); assert.equal(s.running, false);
  s = transition(s, { type: 'next' });
  assert.equal(b.store.journal.save('sample-v1', s, identity), 1);
  assert.equal(b.store.journal.progress.summary('english').xp, 3);
});

for (const alreadyCompleted of [false, true]) test(`terminal navigation snapshot cannot discard observed optional cycles (${alreadyCompleted ? 'completed' : 'first completion'})`, t => {
  const { native, store } = database(); t.after(() => native.close());
  let s = jumpToSourcePhrase(createGroupedSession({ runId: 'terminal', stage: 7, sourcePhraseCount: 2, groupSize: 2, mode: 'manual', rate: 1 }), 0);
  const save = () => store.journal.save('sample-v1', s, identity);
  save();
  for (let i = 0; i < 5; i++) {
    s = speaking(s); save();
    s = transition(s, { type: i === 2 ? 'repeat' : 'confirm' }); save();
  }
  if (alreadyCompleted) { s = transition(s, { type: 'next' }); save(); }
  const before = store.exportBackup(), revision = store.revision();
  const stale: Session = { ...s, phase: 'complete', confirmed: 3, planned: 3,
    unitProgress: [{ confirmed: 3, planned: 3 }] };
  assert.throws(() => store.journal.save('sample-v1', stale, identity));
  assert.equal(store.exportBackup(), before); assert.equal(store.revision(), revision);
  assert.equal(store.journal.progress.summary('english').xp, 10);
  assert.equal(store.journal.completions('sample-v1', 7), alreadyCompleted ? 1 : 0);
  if (alreadyCompleted) {
    const advanced: Session = { ...s, confirmed: 7, planned: 7, unitProgress: [{ confirmed: 7, planned: 7 }] };
    assert.throws(() => store.journal.save('sample-v1', advanced, identity));
    assert.equal(store.exportBackup(), before);
  }
});
