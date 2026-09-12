import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSession, transition } from './session';
import { Journal } from './journal';
import { Player } from './player';
import { canOpenStage } from './stage-overview';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function open(db: DatabaseSync) {
  return new Journal({
    exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | null,
  });
}

test('SQLite persists unfinished audio and preserves unique stage completion history', () => {
  const db = new DatabaseSync(':memory:');
  const journal = open(db);
  let s = createSession({ runId: 'one-run', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
  s = transition(s, { type: 'resume' });
  s = transition(s, { type: 'audio-position', seconds: 1.4 });
  journal.save('sample-v1', s);
  assert.equal(open(db).load('sample-v1', 1, 1)?.audioSeconds, 1.4);
  assert.equal(open(db).load('sample-v1', 1, 1)?.running, false);
  assert.equal(journal.load('sample-v1', 2, 1), null);
  for (let i = 0; i < 3; i++) {
    s = transition(s, { type: 'resume' });
    s = transition(s, { type: 'audio-ended', durationSeconds: 1 });
    s = transition(s, { type: 'confirm' });
  }
  s = transition(s, { type: 'next' });
  journal.save('sample-v1', s);
  journal.save('sample-v1', s);
  assert.equal(journal.completions('sample-v1', 1), 1);
  journal.save('sample-v1', createSession({ ...s, runId: 'new-run' }));
  assert.equal(journal.completions('sample-v1', 1), 1);
  assert.equal(journal.completions('sample-v1', 2), 0);
  db.close();
});

test('a failed completion write rolls back the checkpoint and history together', () => {
  const db = new DatabaseSync(':memory:');
  const journal = open(db);
  const s = createSession({ runId: 'run', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
  journal.save('sample-v1', s);
  db.exec("CREATE TRIGGER deny_history BEFORE INSERT ON completions BEGIN SELECT RAISE(ABORT, 'disk test'); END;");
  assert.throws(() => journal.save('sample-v1', { ...s, confirmed: 3, phase: 'complete' }));
  assert.equal(journal.load('sample-v1', 1, 1)?.phase, 'ready');
  assert.equal(journal.completions('sample-v1', 1), 0);
  db.close();
});

test('closing and reopening a disk-backed database preserves the unfinished speaking cycle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-journal-test-'));
  const file = join(dir, 'learning.db');
  let db = new DatabaseSync(file);
  try {
    const initial = createSession({ runId: 'disk-run', stage: 2, phraseCount: 12, mode: 'auto', rate: 0.75 });
    const speaking = { ...initial, mode: 'auto' as const, phase: 'speaking' as const, running: true, confirmed: 2, remainingMs: 1840 };
    open(db).save('sample-v1', speaking);
    db.close();
    db = new DatabaseSync(file);
    assert.deepEqual(open(db).load('sample-v1', 2, 12), { ...speaking, mode: 'manual', running: false });
    assert.equal(open(db).completions('sample-v1', 2), 0);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});

test('a failed confirmation save blocks practice; retry preserves that confirmation without starting audio', async () => {
  const db = new DatabaseSync(':memory:');
  const journal = open(db);
  let plays = 0;
  const audio = { prepare: async () => {}, play: () => { plays++; }, pause: () => {}, position: () => 1.25, dispose: () => {} };
  const player = new Player(createSession({ runId: 'retry-run', stage: 1, phraseCount: 12, mode: 'manual', rate: 0.75 }),
    audio, state => journal.save('sample-v1', state), () => 0, () => {});
  try {
    await player.resume();
    player.audioEnded(2);
    db.exec("CREATE TRIGGER deny_checkpoint BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT, 'injected save failure'); END;");
    await player.confirm();
    assert.equal(player.error, 'save');
    assert.equal(player.state.running, false);
    assert.equal(player.state.confirmed, 1);
    assert.equal(journal.load('sample-v1', 1, 12)?.confirmed, 0);
    await player.confirm(); await player.choose('next');
    player.retrySave();
    assert.equal(player.error, 'save');
    assert.equal(plays, 1);
    db.exec('DROP TRIGGER deny_checkpoint');
    player.retrySave();
    assert.equal(player.error, null);
    assert.equal(plays, 1);
    assert.equal(journal.load('sample-v1', 1, 12)?.confirmed, 1);
    assert.equal(journal.load('sample-v1', 1, 12)?.running, false);
    assert.equal(journal.completions('sample-v1', 1), 0);
    await player.resume();
    assert.equal(plays, 2);
    assert.equal(player.state.confirmed, 1);
  } finally { db.close(); }
});

test('pause saves the current position while termination can recover only the last durable checkpoint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'native-interruption-'));
  const file = join(dir, 'learning.db');
  let db = new DatabaseSync(file), journal = open(db);
  let now = 0, position = 0, plays = 0;
  const starts: number[] = [];
  const audio = { prepare: async (_phrase: number, start: number) => { starts.push(start); position = start; },
    play: () => { plays++; }, pause: () => {}, position: () => position, dispose: () => {} };
  const makePlayer = (state: ReturnType<typeof createSession>) => new Player(state, audio,
    checkpoint => journal.save('sample-v1', checkpoint), () => now, () => {});
  const initial = { ...createSession({ runId: 'interrupted-run', stage: 2, phraseCount: 12, mode: 'manual', rate: 2.8 }),
    phrase: 6, confirmed: 3, planned: 5, phase: 'listening' as const, audioSeconds: 0.8 };
  try {
    let player = makePlayer(initial);
    await player.resume();
    now = 500; position = 1.4; player.tick();
    now = 749; position = 1.7; player.tick();
    // No pause/dispose callback: a process loss cannot save this newer position.
    db.close(); db = new DatabaseSync(file); journal = open(db);
    let recovered = journal.load('sample-v1', 2, 12)!;
    assert.deepEqual(recovered, { ...initial, audioSeconds: 1.4 });
    player = makePlayer(recovered);
    now = 90000; player.tick();
    assert.equal(plays, 1);
    assert.deepEqual(player.state, recovered);
    await player.resume();
    assert.deepEqual(starts, [0.8, 1.4]);
    position = 2.15; player.pause();
    player.dispose(); db.close(); db = new DatabaseSync(file); journal = open(db);
    recovered = journal.load('sample-v1', 2, 12)!;
    assert.deepEqual(recovered, { ...initial, audioSeconds: 2.15 });
    assert.equal(journal.completions('sample-v1', 2), 0);
    assert.equal(journal.load('sample-v1', 1, 12), null);
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});

test('full twelve-phrase runs unlock stage two and preserve independent history across disk reopen', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = mkdtempSync(join(tmpdir(), 'native-stage-flow-'));
  const file = join(dir, 'learning.db');
  let db = new DatabaseSync(file);
  let journal = open(db);
  const audio = { prepare: async () => {}, play: () => {}, pause: () => {}, position: () => 0, dispose: () => {} };
  const records = () => [1, 2].map(stage => ({ stage, count: journal.completions('sample-v1', stage as 1 | 2), session: null }));
  const makePlayer = (state: ReturnType<typeof createSession>) => new Player(state, audio,
    checkpoint => journal.save('sample-v1', checkpoint), () => 0, () => {});
  try {
    assert.equal(canOpenStage(2, records()), false);
    for (const [runId, stage, rate] of [['first', 1, 1], ['second', 1, 3], ['third', 2, 0.75]] as const) {
      let player = makePlayer(createSession({ runId, stage, phraseCount: 12, mode: 'manual', rate }));
      await player.resume();
      for (let phrase = 0; phrase < 12; phrase++) {
        for (let cycle = 0; cycle < 3; cycle++) {
          player.audioEnded(2);
          assert.equal(player.state.confirmed, cycle);
          await player.choose('next');
          assert.equal(player.state.phrase, phrase);
          await player.confirm();
        }
        if (phrase === 0) {
          await player.choose('repeat');
          assert.equal(player.state.confirmed, 3);
          for (let cycle = 3; cycle < 5; cycle++) { player.audioEnded(2); await player.confirm(); }
          assert.equal(player.state.confirmed, 5);
        }
        if (phrase === 5) {
          player.dispose(); db.close(); db = new DatabaseSync(file); journal = open(db);
          player = makePlayer(journal.load('sample-v1', stage, 12)!);
          assert.equal(player.state.rate, rate);
          assert.equal(player.state.phrase, 5);
          assert.equal(player.state.confirmed, 3);
        }
        assert.equal(journal.completions('sample-v1', stage), runId === 'second' ? 1 : 0);
        const next = player.choose('next');
        t.mock.timers.tick(1000);
        await next;
      }
      assert.equal(player.state.phase, 'complete');
      player.dispose(); db.close(); db = new DatabaseSync(file); journal = open(db);
      player = makePlayer(journal.load('sample-v1', stage, 12)!);
      await player.enter(); await player.choose('next'); player.dispose();
      assert.equal(journal.completions('sample-v1', 1), runId === 'first' ? 1 : 2);
      assert.equal(journal.completions('sample-v1', 2), runId === 'third' ? 1 : 0);
      assert.equal(canOpenStage(2, records()), runId !== 'first');
    }
  } finally { db.close(); rmSync(dir, { recursive: true }); }
});
