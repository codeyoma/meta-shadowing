import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { ProgressCloud } from '../../modules/progress-cloud';
import { nativeModules } from '../test-support/native-render';
import { createSession, createGroupedSession } from './session';
import { Player } from './player';

function fixture(t: TestContext) {
  const databases = new Map<string, DatabaseSync>();
  let failWrites = false, sequence = 0;
  const open = (id: string) => {
    const db = databases.get(id) ?? new DatabaseSync(':memory:'); databases.set(id, db);
    return { exec(sql: string) { if (failWrites && sql === 'BEGIN IMMEDIATE') throw Error('Disk full.'); db.exec(sql); },
      run(sql: string, ...args: (string | number)[]) { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined,
      all: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[] };
  };
  const profiles = new ProgressProfiles(open, () => `sizes-${++sequence}`);
  const cloud = { stop: async () => {}, account: async () => ({ status: 'no-account' }) } as ProgressCloud;
  const sync = new ProgressSync(profiles, cloud);
  t.after(() => { sync.dispose(); databases.forEach(db => db.close()); });
  const load = nativeModules({ '@/native/progress-sync': { getProgressSync: () => sync } });
  const settings = load('native/settings.ts') as typeof import('../native/settings');
  return { profiles, sync, settings, open, fail: (value: boolean) => { failWrites = value; } };
}

test('new empty profiles use 20/18, while existing preferences and progress are not migrated on read', t => {
  const fresh = fixture(t);
  fresh.profiles.initializeLearningSettings();
  assert.deepEqual(fresh.settings.readSettings(), { mode: 'manual', rate: 1, originalTextSize: 20, translationTextSize: 18 });
  assert.equal(fresh.profiles.hasGuestData(), false, 'Untouched defaults are not guest work needing import consent');
  const existing = fixture(t);
  existing.profiles.saveValue('settings', '{"mode":"manual","rate":1.25}');
  existing.profiles.initializeLearningSettings();
  assert.deepEqual(existing.settings.readSettings(), { mode: 'manual', rate: 1.25 });
  const progressed = fixture(t);
  progressed.profiles.current().journal.save('fixture-v1', createSession({ runId: 'existing', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 }));
  progressed.profiles.initializeLearningSettings();
  assert.deepEqual(progressed.settings.readSettings(), { mode: 'manual', rate: 1 });
});

test('saved sizes round-trip through reopen and backup, preserving checkpoints and unrelated preferences', async t => {
  const f = fixture(t);
  f.profiles.saveValue('settings', '{"mode":"manual","rate":1.25,"groupSize":4}');
  const state = createSession({ runId: 'sizes-practice', stage: 11, phraseCount: 2, mode: 'manual', rate: 1.25 });
  const player = new Player(state, { prepare: async () => {}, play() {}, pause() {}, position: () => 0.8, dispose() {} },
    f.profiles.current().journal.createWriter('fixture-v1', state, { language: 'english', book: 'fixture' }), () => 0, () => {});
  await player.resume(); player.pause();
  const before = JSON.stringify(player.state);
  for (const originalTextSize of [21, 22, 23, 48]) {
    assert.equal(f.settings.saveSettings({ ...f.settings.readSettings(), originalTextSize }, 'guest', 0), true);
  }
  assert.equal(JSON.stringify(player.state), before);
  const copy = fixture(t);
  copy.profiles.current().restoreBackup(f.profiles.current().exportBackup());
  assert.deepEqual(copy.settings.readSettings(), { mode: 'manual', rate: 1.25, groupSize: 4, originalTextSize: 48 });
  assert.equal(copy.profiles.current().journal.load('fixture-v1', 11, 2)?.audioSeconds, 0.8);
  assert.equal(copy.profiles.current().journal.progress.summary('english').xp, 0);
  const reopened = new ProgressProfiles(f.open, () => 'unused');
  assert.equal(JSON.parse(reopened.readValue('settings')!).originalTextSize, 48);
  f.fail(true);
  assert.throws(() => f.settings.saveSettings({ ...f.settings.readSettings(), originalTextSize: 12 }, 'guest', 0));
  assert.equal(f.settings.readSettings().originalTextSize, 48);
  f.fail(false); player.dispose();
});

test('size changes stay profile-isolated and stale settings callbacks cannot save after switching', async t => {
  const f = fixture(t);
  f.settings.saveSettings({ mode: 'manual', rate: 1, originalTextSize: 24 }, 'guest', 0);
  f.sync.profiles.select(f.profiles.create());
  f.sync.changed();
  assert.equal(f.settings.saveSettings({ mode: 'manual', rate: 1, originalTextSize: 48 }, 'guest', 0), false);
  assert.equal(f.settings.readSettings().originalTextSize, undefined);
  assert.equal(JSON.parse(f.profiles.readValue('settings', 'guest')!).originalTextSize, 24);
});

test('size edits leave media/reveal checkpoints and rewards unchanged across stage families', async t => {
  const f = fixture(t);
  for (const stage of [1, 3, 7, 11, 13, 15] as const) {
    const input = { runId: `stage-${stage}`, stage, mode: 'manual' as const, rate: 1.25 };
    const state = stage === 7 ? createGroupedSession({ ...input, sourcePhraseCount: 8, groupSize: 4 })
      : createSession({ ...input, phraseCount: 8 });
    let preparations = 0;
    const player = new Player(state, { prepare: async () => { preparations++; }, play() {}, pause() {},
      position: () => 1.5, dispose() {} }, f.profiles.current().journal.createWriter('fixture-v1', state,
      { language: 'english', book: 'fixture' }), () => 0, () => {});
    await player.resume(); player.pause();
    const checkpoint = JSON.stringify(player.state);
    f.settings.saveSettings({ ...f.settings.readSettings(), originalTextSize: 12, translationTextSize: 48 }, 'guest', 0);
    assert.equal(JSON.stringify(player.state), checkpoint);
    assert.equal(preparations, 1);
    assert.equal(f.profiles.current().journal.load('fixture-v1', stage, 8)?.audioSeconds, 1.5);
    assert.equal(f.profiles.current().journal.progress.summary('english').xp, 0);
    player.dispose();
  }
});
