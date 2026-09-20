import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProgressBackupStore, type BackupDatabase } from './progress-backup';
import { createSession, transition } from './session';
import { changeRevealSpeed } from './word-reveal';

function store(native: DatabaseSync) {
  const db: BackupDatabase = {
    exec: sql => native.exec(sql), run: (sql, ...args) => { native.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).get(...args) as T | undefined,
    all: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).all(...args) as T[],
  };
  return new ProgressBackupStore(db, () => new Date('2026-09-20T12:00:00Z'));
}

test('silent stage disk reopen and backup restore retain S4 and partial word progress without duplicate XP', t => {
  const directory = mkdtempSync(join(tmpdir(), 'reveal-recovery-'));
  let disk = new DatabaseSync(join(directory, 'progress.sqlite'));
  const targetDb = new DatabaseSync(':memory:');
  t.after(() => { disk.close(); targetDb.close(); rmSync(directory, { recursive: true, force: true }); });
  const identity = { book: 'sample', language: 'english' };
  let source = store(disk);
  let state = changeRevealSpeed(createSession({ runId: 'rapid-recovery', stage: 15, phraseCount: 2, rate: 1, mode: 'manual' }), 4);
  const save = (value: typeof state) => source.journal.save('sample-v1', value, identity);
  assert.equal(save(state), 0);
  state = transition(state, { type: 'resume' });
  state = transition(state, { type: 'audio-ended', durationSeconds: 1 });
  assert.equal(save(state), 0);
  state = transition(state, { type: 'confirm' });
  assert.equal(save(state), 3);
  assert.equal(state.phrase, 1);
  state = transition(state, { type: 'resume' });
  state = transition(state, { type: 'audio-position', seconds: 0.31 });
  assert.equal(save(state), 0);
  disk.close(); disk = new DatabaseSync(join(directory, 'progress.sqlite')); source = store(disk);
  const reopened = source.journal.load('sample-v1', 15, 2)!;
  assert.equal(reopened.running, false);
  assert.equal(reopened.audioSeconds, 0.31);
  assert.deepEqual(reopened.reveal, { speed: 4, wpm: 300 });
  const target = store(targetDb);
  const payload = source.exportBackup();
  target.restoreBackup(payload); target.restoreBackup(payload);
  assert.deepEqual(target.journal.load('sample-v1', 15, 2), reopened);
  assert.equal(target.journal.progress.summary('english').xp, 3);
  const resumed = transition(reopened, { type: 'resume' });
  const ended = transition(resumed, { type: 'audio-ended', durationSeconds: 1 });
  assert.equal(target.journal.save('sample-v1', ended, identity), 0);
  const confirmed = transition(ended, { type: 'confirm' });
  assert.equal(target.journal.save('sample-v1', confirmed, identity), 3);
  assert.equal(target.journal.save('sample-v1', confirmed, identity), 0);
  assert.equal(confirmed.phase, 'complete');
  source.mergeBackup(target.exportBackup());
  source.mergeBackup(target.exportBackup());
  target.mergeBackup(source.exportBackup());
  assert.equal(source.journal.progress.summary('english').xp, 6);
  assert.equal(target.journal.progress.summary('english').xp, 6);
  assert.equal(source.journal.completions('sample-v1', 15), 1);
});

test('legacy one-XP receipts remain unchanged while new single-pass receipts survive replay and merging', t => {
  for (const pinned of [false, true]) {
    const databases = Array.from({ length: 3 }, () => new DatabaseSync(':memory:'));
    t.after(() => databases.forEach(db => db.close()));
    const [seed, left, right] = databases.map(store);
    const identity = { book: 'sample', language: 'english' };
    let state = createSession({ runId: 'legacy-xp', stage: 11, phraseCount: 2, mode: 'manual', rate: 1 });
    seed!.journal.save('sample-v1', state, identity);
    state = transition(transition(state, { type: 'resume' }), { type: 'audio-ended', durationSeconds: 1 });
    seed!.journal.save('sample-v1', state, identity);
    seed!.journal.save('sample-v1', transition(state, { type: 'next' }), identity);
    // Literal historical receipt: one confirmed pass, one XP, two more planned.
    const legacy = JSON.parse(seed!.exportBackup());
    const checkpoint = JSON.parse(legacy.tables.checkpoints[0].state);
    Object.assign(checkpoint, { phrase: 0, confirmed: 1, planned: 3, phase: 'ready',
      unitProgress: [{ confirmed: 1, planned: 3 }, { confirmed: 0, planned: 3 }] });
    legacy.tables.checkpoints[0].state = JSON.stringify(checkpoint);
    Object.assign(legacy.tables.cycle_credits[0], { phrase: 0, confirmed: 1, credited: 1 });
    legacy.tables.unit_credits[0].state = JSON.stringify({ counts: [1, 0], sourceCount: 2, groupSize: 1, baseline: 1, earned: 0 });
    delete legacy.sync.runs[0].events[0].multiplier;
    const payload = JSON.stringify(legacy);
    left!.restoreBackup(payload); right!.restoreBackup(payload);
    assert.equal(left!.journal.progress.summary('english').xp, 1);
    for (const target of [left!, right!]) {
      let resumed = target.journal.load('sample-v1', 11, 2)!;
      assert.equal(resumed.planned, 2);
      const write = pinned ? target.journal.createWriter('sample-v1', resumed, identity)
        : (value: typeof resumed) => target.journal.save('sample-v1', value, identity);
      assert.equal(write(resumed), 0, 'Migration alone grants no XP');
      resumed = transition(transition(resumed, { type: 'resume' }), { type: 'audio-ended', durationSeconds: 1 });
      assert.equal(write(resumed), 0);
      resumed = transition(resumed, { type: 'next' });
      assert.equal(write(resumed), 3);
      assert.equal(write(resumed), 0);
      assert.equal(target.journal.progress.summary('english').xp, 4);
    }
    left!.mergeBackup(right!.exportBackup()); right!.mergeBackup(left!.exportBackup());
    assert.equal(left!.journal.progress.summary('english').xp, 4);
    assert.equal(right!.journal.progress.summary('english').xp, 4);
  }
});
