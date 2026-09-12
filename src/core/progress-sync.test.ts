import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { BackupDatabase } from './progress-backup';
import type { ProgressCloud } from '../../modules/progress-cloud';
import { createSession } from './session';

function fixture(t: TestContext) {
  const databases = new Map<string, DatabaseSync>();
  t.after(() => databases.forEach(db => db.close()));
  const open = (id: string): BackupDatabase => {
    let db = databases.get(id); if (!db) { db = new DatabaseSync(':memory:'); databases.set(id, db); }
    const native = db;
    return { exec: sql => native.exec(sql), run: (sql, ...args) => { native.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).get(...args) as T | undefined,
      all: <T>(sql: string, ...args: (string | number)[]) => native.prepare(sql).all(...args) as T[] };
  };
  let sequence = 0;
  const profiles = new ProgressProfiles(open, () => `profile-${++sequence}`);
  const published: string[] = [];
  const cloud: ProgressCloud = { account: async () => ({ status: 'available', scope: 'account-a' }), list: async () => [],
    read: async () => { throw Error('unused'); }, publish: async (_, revision, json) => { published.push(json); return { revision }; },
    stop: async () => {}, addListener: () => ({ remove() {} }) };
  const sync = new ProgressSync(profiles, cloud);
  t.after(() => sync.dispose());
  return { profiles, cloud, sync, published, open };
}
const session = () => createSession({ runId: 'finished', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('guest history is preserved and published only after successful fetch and explicit import', async t => {
  const { profiles, cloud, sync, published } = fixture(t);
  const guest = profiles.current();
  guest.journal.save('sample-v1', { ...session(), confirmed: 3, phase: 'complete' });
  cloud.list = async () => { throw Error('progress-cloud-offline'); };
  await sync.refreshAccount(); await sync.enable(true);
  assert.equal(published.length, 0);
  cloud.list = async () => [];
  await sync.refreshAccount();
  assert.equal(published.length, 0);
  await sync.enable(true);
  assert.equal(published.length, 1);
  assert.equal(guest.journal.completions('sample-v1', 1), 1);
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 1);
});

test('import captures the paused original player and a failed local save aborts profile selection', async t => {
  const { sync, profiles } = fixture(t);
  await sync.refreshAccount();
  const remove = sync.beforeSwitch(() => { throw Error('disk'); });
  await sync.enable(true);
  assert.equal(profiles.id(), 'guest');
  remove();
  sync.beforeSwitch(() => profiles.store('guest').journal.save('sample-v1', session()));
  await sync.enable(true);
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1)?.runId, 'finished');
});

test('declining guest import starts an independent profile with defaults and durable consent', async t => {
  const { sync, profiles, open, published } = fixture(t);
  profiles.store('guest').journal.save('sample-v1', session());
  await sync.refreshAccount(); await sync.enable(false);
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1), null);
  assert.equal(published.length, 1);
  const reopened = new ProgressProfiles(open, () => 'other', () => '{"mode":"manual","rate":3}');
  assert.equal(reopened.id(), profiles.id());
  assert.equal(reopened.account('account-a')?.enabled, 1);
  assert.equal(reopened.readValue('settings'), '{"mode":"manual","rate":1}');
});

test('hung list never blocks sign-out and old consent cannot authorize the next account', async t => {
  const { sync, cloud, profiles, published } = fixture(t);
  const list = deferred<[]>(); cloud.list = () => list.promise;
  const old = sync.refreshAccount(); await Promise.resolve();
  const generation = sync.getSnapshot().generation;
  cloud.account = async () => ({ status: 'no-account' });
  await sync.refreshAccount();
  assert.equal(sync.getSnapshot().status, 'no-account');
  list.resolve([]); await old;
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); cloud.list = async () => [];
  await sync.refreshAccount(); await sync.enable(true, generation);
  assert.equal(profiles.id(), 'guest'); assert.equal(published.length, 0);
});

test('recovery validates remote data, preserves guest, and never replaces later local edits', async t => {
  const { sync, cloud, profiles } = fixture(t);
  profiles.store('guest').journal.save('sample-v1', session());
  cloud.list = async () => [{ id: 'remote', createdAt: '2026-09-12T12:00:00Z', revision: 90 }];
  cloud.read = async () => profiles.store('guest').exportBackup();
  await sync.refreshAccount(); await sync.enable(true);
  assert.equal(profiles.id(), 'guest');
  const id = sync.getSnapshot().backups[0]!.id;
  await sync.restore(id);
  const profile = profiles.id();
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}');
  await sync.restore(id); await sync.refreshAccount();
  assert.equal(profiles.id(), profile);
  assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":2}');
  assert.equal(profiles.store('guest').journal.load('sample-v1', 1, 1)?.runId, 'finished');
});

test('late read cannot install a backup after account change', async t => {
  const { sync, cloud, profiles } = fixture(t);
  const read = deferred<string>();
  cloud.list = async () => [{ id: 'remote', createdAt: '', revision: 90 }]; cloud.read = () => read.promise;
  await sync.refreshAccount(); const old = sync.restore(sync.getSnapshot().backups[0]!.id);
  cloud.account = async () => ({ status: 'no-account' }); await sync.refreshAccount();
  read.resolve(profiles.store('guest').exportBackup()); await old;
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.account('account-a'), undefined);
});

test('late publication cannot acknowledge newer edits or a different account; unknown retains local history', async t => {
  const { sync, cloud, profiles } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.current(); original.saveValue('settings', '{"mode":"manual","rate":2}');
  const publish = deferred<{ revision: number }>(); const revision = original.revision(); cloud.publish = () => publish.promise;
  const old = sync.retry();
  original.saveValue('settings', '{"mode":"manual","rate":3}');
  cloud.account = async () => ({ status: 'unknown' }); await sync.refreshAccount();
  assert.equal(profiles.current(), original);
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.refreshAccount();
  publish.resolve({ revision }); await old;
  assert.equal(profiles.id(), 'guest'); assert.equal(original.pending(), true);
});

test('persistent dirty work survives restart and disable preserves the selected local profile', async t => {
  const { sync, cloud, profiles, open, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}'); sync.dispose();
  const reopened = new ProgressProfiles(open, () => 'other'); const next = new ProgressSync(reopened, cloud);
  t.after(() => next.dispose()); await next.refreshAccount(); await next.retry();
  assert.equal(published.length, 2); assert.equal(reopened.current().pending(), false);
  const id = reopened.id(); next.disable();
  assert.equal(reopened.id(), id); assert.equal(reopened.account('account-a')?.enabled, 0);
});

test('a matching old publication acknowledges only its captured revision and coalesces newer edits for one minute', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, profiles, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const store = profiles.current(); store.saveValue('settings', '{"mode":"manual","rate":2}');
  const result = deferred<{ revision: number }>(); cloud.publish = () => result.promise;
  const revision = store.revision(); const flight = sync.retry();
  store.saveValue('settings', '{"mode":"manual","rate":3}'); sync.changed(); sync.changed();
  result.resolve({ revision }); await flight;
  assert.equal(store.pending(), true);
  cloud.publish = async (_, revision, json) => { published.push(json); return { revision }; };
  t.mock.timers.tick(59_999); await Promise.resolve(); assert.equal(published.length, 1);
  t.mock.timers.tick(1); await Promise.resolve(); await Promise.resolve();
  assert.equal(published.length, 2); assert.equal(store.pending(), false);
});

test('stale disable action cannot turn off a newly selected account', async t => {
  const { sync, cloud, profiles } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const generation = sync.getSnapshot().generation;
  cloud.account = async () => ({ status: 'available', scope: 'account-b' });
  await sync.refreshAccount(); await sync.enable(false);
  sync.disable(generation);
  assert.equal(profiles.account('account-b')?.enabled, 1);
});

test('ordinary backup timers stop while inactive and resume with the latest local revision', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, profiles, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}'); sync.changed();
  sync.setActive(false); t.mock.timers.tick(60_000); await Promise.resolve();
  assert.equal(published.length, 1);
  sync.setActive(true); t.mock.timers.tick(0); await Promise.resolve(); await Promise.resolve();
  assert.equal(published.length, 2);
});

test('invalid remote data and failed pointer commits leave the existing guest and consent untouched', async t => {
  const { sync, cloud, profiles, open, published } = fixture(t);
  profiles.current().journal.save('sample-v1', session());
  cloud.list = async () => [{ id: 'remote', createdAt: '', revision: 90 }];
  cloud.read = async () => '{';
  await sync.refreshAccount(); await sync.restore(sync.getSnapshot().backups[0]!.id);
  assert.equal(sync.getSnapshot().error, 'progress-cloud-corrupt');
  assert.equal(profiles.id(), 'guest');
  cloud.read = async () => profiles.store('guest').exportBackup();
  open('progress-profiles-v1').exec("CREATE TRIGGER deny_pointer BEFORE UPDATE ON active_profile BEGIN SELECT RAISE(ABORT, 'disk test'); END");
  await sync.restore(sync.getSnapshot().backups[0]!.id);
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.account('account-a'), undefined);
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1)?.runId, 'finished');
  assert.equal(published.length, 0);
});

test('a transient offline publication retries quietly while remaining foreground', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, cloud, profiles, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}');
  cloud.publish = async () => { throw Error('progress-cloud-offline'); };
  await sync.retry(); assert.equal(profiles.current().pending(), true);
  cloud.publish = async (_, revision, json) => { published.push(json); return { revision }; };
  t.mock.timers.tick(60_000); await Promise.resolve(); await Promise.resolve();
  assert.equal(published.length, 2); assert.equal(profiles.current().pending(), false);
});

test('unknown identity retries at a bounded interval and confirms identity before pending publication', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, cloud, profiles, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.current(); original.saveValue('settings', '{"mode":"manual","rate":2}');
  let lookups = 0;
  cloud.account = async () => { lookups++; return { status: 'unknown' }; };
  await sync.refreshAccount(); sync.changed();
  t.mock.timers.tick(59_999); await Promise.resolve();
  assert.equal(lookups, 1); assert.equal(profiles.current(), original); assert.equal(published.length, 1);
  cloud.account = async () => { lookups++; return { status: 'available', scope: 'account-a' }; };
  t.mock.timers.tick(1); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(lookups, 2); assert.equal(sync.getSnapshot().status, 'available');
  t.mock.timers.tick(0); await Promise.resolve(); await Promise.resolve();
  assert.equal(profiles.current(), original); assert.equal(published.length, 2);
});

for (const action of ['background', 'disable', 'dispose'] as const) test(`unknown identity retry is cancelled by ${action}`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, cloud, profiles, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.current(); let lookups = 0;
  cloud.account = async () => { lookups++; return { status: 'unknown' }; };
  await sync.refreshAccount();
  if (action === 'background') sync.setActive(false);
  else if (action === 'disable') sync.disable();
  else sync.dispose();
  sync.changed(); t.mock.timers.tick(180_000); await Promise.resolve();
  assert.equal(lookups, 1); assert.equal(profiles.current(), original); assert.equal(published.length, 1);
});

test('a delayed identity retry cannot replace a newer confirmed account generation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, cloud, profiles, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  cloud.account = async () => ({ status: 'unknown' }); await sync.refreshAccount();
  const delayed = deferred<{ status: 'available'; scope: string }>(); cloud.account = () => delayed.promise;
  t.mock.timers.tick(60_000);
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.refreshAccount();
  delayed.resolve({ status: 'available', scope: 'account-a' }); await Promise.resolve(); await Promise.resolve();
  assert.equal(profiles.id(), 'guest'); assert.equal(sync.getSnapshot().hasProfile, false);
  assert.equal(published.length, 1);
});
