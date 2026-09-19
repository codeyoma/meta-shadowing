import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sample from '../../assets/sample/manifest.json';
import { Journal } from './journal';
import { LearningContext, packageKeyOf } from './learning-context';
import { createSession } from './session';
import { Player, type AudioPort } from './player';
import { installPackage, verifyPackage, type PackageIO } from './package';

test('downloaded content removal, disk reopen and reinstall preserve the exact unfinished cycle and rewards', async () => {
  const root = mkdtempSync(join(tmpdir(), 'package-recovery-'));
  // Controlled sample bytes under a distinct downloaded identity; never private DUO text/audio.
  const pack = { language: 'english', manifest: { ...sample, id: 'recovery-fixture', phrases: sample.phrases.slice(0, 2) } };
  const key = packageKeyOf(pack), materials = join(root, key), database = join(root, 'learning.db');
  let db = new DatabaseSync(database);
  const journal = () => new Journal({ exec: sql => db.exec(sql),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined,
  }, () => new Date('2026-09-19T12:00:00Z'));
  let online = true;
  const io: PackageIO = {
    source: async name => { assert.equal(online, true, 'offline resume must not download'); return readFileSync(join('assets/sample', name)); },
    read: async name => existsSync(join(materials, name)) ? readFileSync(join(materials, name)) : null,
    write: async (name, bytes) => { mkdirSync(join(materials, 'audio'), { recursive: true }); writeFileSync(join(materials, name), bytes); },
    markReady: async ready => { if (ready) writeFileSync(join(materials, 'ready'), '1'); },
    hash: async bytes => createHash('sha256').update(bytes).digest('hex'),
  };
  const players: Player[] = [];
  const preparations: number[][] = [];
  const audio: AudioPort = { prepare: async (...args) => { preparations.push(args); },
    play() {}, pause() {}, position: () => 1.75, dispose() {} };
  try {
    const records = journal(), context = new LearningContext(pack, records);
    await installPackage(pack.manifest, io);
    const makePlayer = (runId: string) => {
      const initial = createSession({ runId, stage: 1, phraseCount: 2, mode: 'manual', rate: 0.75 });
      const player = new Player(initial, audio, context.createWriter(initial), () => 0, () => {});
      players.push(player); return player;
    };
    const completed = makePlayer('completed');
    await completed.resume();
    for (let phrase = 0; phrase < 2; phrase++) {
      for (let cycle = 0; cycle < 3; cycle++) { completed.audioEnded(3); await completed.confirm(); }
      await completed.choose('next');
    }
    completed.dispose();
    const unfinished = makePlayer('unfinished');
    await unfinished.resume(); unfinished.audioEnded(3); await unfinished.confirm(); unfinished.pause();
    const saved = context.load(1)!;
    assert.equal(saved.confirmed, 1);
    assert.equal(saved.audioSeconds, 1.75);
    assert.equal(context.completions(1), 1);
    assert.equal(records.progress.summary('english').xp, 7);
    assert.equal(records.progress.summary('english').streak, 1);
    unfinished.dispose(); players.length = 0;
    // This filesystem boundary is a fixture; Swift tests exercise native scoped removal.
    rmSync(materials, { recursive: true });
    db.close(); db = new DatabaseSync(database);
    const reopenedRecords = journal(), reopened = new LearningContext(pack, reopenedRecords);
    assert.deepEqual(reopened.load(1), saved);
    assert.equal(await verifyPackage(pack.manifest, io), false);
    await installPackage(pack.manifest, io);
    online = false;
    assert.equal(await verifyPackage(pack.manifest, io), true);
    const restored = reopened.load(1)!;
    const player = new Player(restored, audio, reopened.createWriter(restored), () => 0, () => {});
    players.push(player);
    await player.resume(); player.pause();
    assert.deepEqual(preparations.at(-1), [0, 1.75, 0.75]);
    assert.deepEqual(reopened.load(1), saved);
    assert.equal(reopened.completions(1), 1);
    assert.equal(reopenedRecords.progress.summary('english').xp, 7);
    assert.equal(reopenedRecords.progress.summary('english').streak, 1);
    const otherVersion = new LearningContext({ ...pack, manifest: { ...pack.manifest, version: 2 } }, reopenedRecords);
    assert.equal(otherVersion.load(1), null);
    const incompatible = new LearningContext({ ...pack, manifest: { ...pack.manifest, phrases: pack.manifest.phrases.slice(0, 1) } }, reopenedRecords);
    assert.throws(() => incompatible.load(1));
    assert.deepEqual(reopened.load(1), saved);
    assert.equal(reopenedRecords.progress.summary('english').xp, 7);
  } finally {
    players.forEach(player => player.dispose());
    db.close(); rmSync(root, { recursive: true });
  }
});
