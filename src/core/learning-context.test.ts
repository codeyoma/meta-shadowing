import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import sample from '../../assets/sample/manifest.json';
import { Journal } from './journal';
import { createSession } from './session';
import { Player } from './player';
import { LearningContext, resolvePackage, type LearningPackage } from './learning-context';

const first: LearningPackage = { manifest: sample, language: 'english' };
const second: LearningPackage = { manifest: { ...sample, id: 'evening-notes', version: 2 }, language: 'english' };
function journal(db: DatabaseSync) {
  return new Journal({ exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined });
}

test('selected package and version restore only their own existing unfinished practice', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const storage = journal(db);
    const saved = { ...createSession({ runId: 'existing', stage: 1, phraseCount: 12, mode: 'manual', rate: 0.75 }),
      phrase: 6, confirmed: 1, phase: 'listening' as const, audioSeconds: 1.25 };
    // The installed sample's existing key is a compatibility contract, not a new migration.
    storage.save('morning-notes-v1', saved);
    const selected = resolvePackage([first, second], 'evening-notes-v2')!;
    const evening = new LearningContext(selected, storage);
    assert.equal(evening.load(1), null);
    evening.save({ ...saved, runId: 'evening', audioSeconds: 2.5 });
    assert.equal(evening.load(1)?.audioSeconds, 2.5);
    const morning = new LearningContext(resolvePackage([first, second], 'morning-notes-v1')!, journal(db));
    assert.deepEqual(morning.load(1), saved);
    assert.equal(morning.completions(1), 0);
    const nextVersion = new LearningContext({ ...first, manifest: { ...sample, version: 2 } }, storage);
    assert.equal(nextVersion.load(1), null);
    assert.equal(resolvePackage([first, second], 'morning-notes-v99'), null);
    assert.equal(resolvePackage([first, second], undefined), null);
    assert.equal(resolvePackage([first, second], ['morning-notes-v1']), null);
  } finally { db.close(); }
});

test('ambiguous package versions are unavailable instead of choosing arbitrary content', () => {
  assert.equal(resolvePackage([first, { ...first, manifest: { ...sample, title: 'Conflicting release' } }], 'morning-notes-v1'), null);
});

test('player confirmation and option saves remain scoped to the selected book with idempotent rewards', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const storage = journal(db);
    const pack = { ...second, manifest: { ...second.manifest, phrases: sample.phrases.slice(0, 1) } };
    const context = new LearningContext(pack, storage);
    const sampleContext = new LearningContext(first, storage);
    const initial = createSession({ runId: 'selected-run', stage: 1, phraseCount: 1, mode: 'manual', rate: 1.25 });
    const audio = { prepare: async () => {}, play: () => {}, pause: () => {}, position: () => 0, dispose: () => {} };
    const player = new Player(initial, audio, s => context.save(s), () => 0, () => {});
    await player.resume();
    for (let cycle = 0; cycle < 3; cycle++) { player.audioEnded(2); await player.confirm(); }
    assert.equal(context.completions(1), 0);
    await player.choose('next');
    player.dispose();
    const saved = new LearningContext(pack, journal(db)).load(1)!;
    context.save(saved);
    assert.equal(context.completions(1), 1);
    assert.equal(sampleContext.completions(1), 0);
    assert.equal(sampleContext.load(1), null);
    assert.equal(storage.progress.summary('english').xp, 10);
    assert.throws(() => sampleContext.save(saved), /Incompatible/);
    assert.equal(sampleContext.load(1), null);
  } finally { db.close(); }
});
