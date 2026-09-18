import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import { enableAutomaticBackup, refreshProgress } from './enable-backup';
import type { BackupDatabase } from './progress-backup';
import type { ProgressCloud, CloudPublication } from '../../modules/progress-cloud';

function fixture(t: TestContext) {
  const databases = new Map<string, DatabaseSync>();
  t.after(() => databases.forEach(db => db.close()));
  const open = (id: string): BackupDatabase => {
    let db = databases.get(id);
    if (!db) { db = new DatabaseSync(':memory:'); databases.set(id, db); }
    const store = db;
    return { exec: sql => store.exec(sql), run: (sql, ...args) => { store.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => store.prepare(sql).get(...args) as T | undefined,
      all: <T>(sql: string, ...args: (string | number)[]) => store.prepare(sql).all(...args) as T[] };
  };
  let sequence = 0;
  const preferences = new Map<string, string>();
  const profiles = new ProgressProfiles(open, () => `profile-${++sequence}`,
    key => preferences.get(key) ?? null, (key, value) => { preferences.set(key, value); });
  let head: CloudPublication | undefined, payload = '';
  const cloud: ProgressCloud = {
    account: async () => ({ status: 'available', scope: 'account-a' }),
    list: async () => head ? [head] : [], read: async () => payload,
    publish: async (_, revision, json, base) => {
      assert.equal(base, head?.token ?? '');
      payload = json;
      return head = { id: `head-${++sequence}`, token: `token-${sequence}`, revision, legacy: false, createdAt: '', cleanupPending: false };
    },
    cleanup: async () => false, stop: async () => {}, addListener: () => ({ remove() {} }),
    reset: async () => { throw Error('progress-cloud-unavailable'); }, discardLocal: async () => {},
  };
  const sync = new ProgressSync(profiles, cloud);
  t.after(() => sync.dispose());
  return { sync, profiles, cloud };
}

test('an empty new installation enables without asking whose guest records to include', async t => {
  const { sync } = fixture(t);
  await sync.refreshAccount(false);
  await enableAutomaticBackup(sync, async () => { assert.fail('empty guest must not prompt'); });
  assert.equal(sync.getSnapshot().enabled, true);
  assert.equal(sync.getSnapshot().hasProfile, true);
});

test('manual first sync obtains guest consent and leaves automatic sync switched off', async t => {
  const { sync, profiles } = fixture(t);
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  await sync.refreshAccount(false);
  let prompts = 0;
  await refreshProgress(sync, async () => { prompts++; return true; });
  assert.equal(prompts, 1);
  assert.equal(sync.getSnapshot().enabled, false);
  assert.equal(sync.getSnapshot().hasProfile, true);
  assert.equal(profiles.readValue('settings'), '{"mode":"manual","rate":2}');
});

test('canceling manual guest import keeps local records and automatic sync untouched', async t => {
  const { sync, profiles } = fixture(t);
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  await sync.refreshAccount(false);
  await refreshProgress(sync, async () => null);
  assert.equal(sync.getSnapshot().hasProfile, false);
  assert.equal(sync.getSnapshot().enabled, false);
  assert.equal(profiles.id(), 'guest');
  assert.equal(profiles.readValue('settings'), '{"mode":"manual","rate":2}');
});

test('manual guest consent cannot cross an account change', async t => {
  const { sync, profiles, cloud } = fixture(t);
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  await sync.refreshAccount(false);
  let decide!: (value: boolean) => void;
  const pending = refreshProgress(sync, () => new Promise(resolve => { decide = resolve; }));
  cloud.account = async () => ({ status: 'available', scope: 'account-b' });
  await sync.refreshAccount(false);
  decide(true);
  await pending;
  assert.equal(sync.getSnapshot().hasProfile, false);
  assert.equal(profiles.id(), 'guest');
});
