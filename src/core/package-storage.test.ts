import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import manifest from '../../assets/sample/manifest.json';
import { PackageMaterialStorage, PackageOperations, knownMaterialKey } from './package-storage';
import { installPackage, verifyPackage, type PackageIO } from './package';
import { Journal } from './journal';
import { LearningContext } from './learning-context';

import { createLegacySession as createSession } from '../../tests/legacy-session';
import { Player } from './player';

const bundled = { language: 'english', manifest };
const hosted = { language: 'english', manifest: { ...manifest, id: 'hosted-morning-notes', title: 'Morning Notes · Apple-hosted' } };

test('storage rejects unsupported identities and changed immutable manifests before invoking native ports', async () => {
  const service = new PackageMaterialStorage(new PackageOperations(), {
    read: async () => { assert.fail('unsupported read reached native'); },
    remove: async () => { assert.fail('unsupported removal reached native'); },
  });
  for (const pack of [
    { ...bundled, language: 'japanese' },
    { ...bundled, manifest: { ...manifest, id: 'delivery-diagnostic' } },
    { ...bundled, manifest: { ...manifest, version: 2 } },
    { ...bundled, manifest: { ...manifest, phrases: manifest.phrases.slice(1) } },
    { ...bundled, manifest: { ...manifest, id: '../outside' } },
  ]) {
    await assert.rejects(service.read(pack), /Unsupported/);
    await assert.rejects(service.remove(pack), /Unsupported/);
  }
  assert.equal(knownMaterialKey(bundled), 'morning-notes-v1');
  assert.equal(knownMaterialKey(hosted), 'hosted-morning-notes-v1');
});

test('bundled install and verification hold the same removal lock and release it after failures', async () => {
  const operations = new PackageOperations();
  let finish!: () => void;
  const hold = new Promise<void>(resolve => { finish = resolve; });
  const storage = new PackageMaterialStorage(operations, {
    read: async (_key, busy) => ({ bytes: 4, installed: !busy, busy }),
    remove: async () => ({ cacheCleared: true }),
  });
  const installing = operations.run('morning-notes-v1', () => hold);
  assert.deepEqual(await storage.read(bundled), { bytes: 4, installed: false, busy: true });
  await assert.rejects(storage.remove(bundled), /running/);
  finish(); await installing;
  await assert.rejects(operations.run('morning-notes-v1', async () => { throw Error('disk failure'); }));
  assert.deepEqual(await storage.remove(bundled), { cacheCleared: true });
});

test('selected material removal and reinstall preserve a real SQLite checkpoint, history and XP', async () => {
  const root = mkdtempSync(join(tmpdir(), 'material-journal-'));
  const db = new DatabaseSync(join(root, 'learning.db'));
  const journal = new Journal({ exec: sql => db.exec(sql), run: (sql, ...args) => { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined });
  const context = new LearningContext(bundled, journal);
  const selected = join(root, 'morning-notes-v1');
  const sibling = join(root, 'hosted-morning-notes-v1');
  const io: PackageIO = {
    source: async name => readFileSync(join(process.cwd(), 'assets/sample', name)),
    read: async name => existsSync(join(selected, name)) ? readFileSync(join(selected, name)) : null,
    write: async (name, bytes) => { mkdirSync(join(selected, 'audio'), { recursive: true }); writeFileSync(join(selected, name), bytes); },
    markReady: async ready => { if (ready) writeFileSync(join(selected, 'ready'), '1'); },
    hash: async bytes => createHash('sha256').update(bytes).digest('hex'),
  };
  const operations = new PackageOperations();
  // Thin host-filesystem port: production orchestration above native deletion is
  // exercised here; Swift real-file tests cover containment and byte traversal.
  const storage = new PackageMaterialStorage(operations, {
    read: async (_key, busy) => ({ bytes: 0, installed: await verifyPackage(manifest, io), busy }),
    remove: async key => { rmSync(join(root, key), { recursive: true, force: true }); return { cacheCleared: true }; },
  });
  try {
    mkdirSync(sibling); writeFileSync(join(sibling, 'preserved'), 'sibling material');
    await operations.run('morning-notes-v1', () => installPackage(manifest, io));
    const initial = createSession({ runId: 'rewarded', stage: 1, phraseCount: 12, mode: 'manual', rate: 1 });
    const player = new Player({ ...initial, phrase: 11, confirmed: 2, phase: 'speaking', running: true },
      { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} },
      state => context.save(state), () => 0, () => {});
    context.save(player.state); await player.choose('next');
    context.save({ ...initial, runId: 'unfinished', phrase: 3, phase: 'listening', audioSeconds: 1.75, confirmed: 1 });
    const checkpoint = context.load(1);
    const rows = () => ['checkpoints', 'completions', 'stage_awards', 'daily_stages', 'study_days', 'cycle_credits']
      .map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const before = rows();
    assert.equal(journal.progress.summary('english').xp, 1);
    await storage.remove(bundled);
    assert.equal(existsSync(selected), false);
    assert.equal(readFileSync(join(sibling, 'preserved'), 'utf8'), 'sibling material');
    assert.deepEqual(context.load(1), checkpoint);
    await operations.run('morning-notes-v1', () => installPackage(manifest, io));
    assert.equal((await storage.read(bundled)).installed, true);
    assert.deepEqual(context.load(1), checkpoint);
    assert.equal(context.completions(1), 1);
    assert.equal(journal.progress.summary('english').xp, 1);
    assert.deepEqual(rows(), before);
  } finally { db.close(); rmSync(root, { recursive: true }); }
});
