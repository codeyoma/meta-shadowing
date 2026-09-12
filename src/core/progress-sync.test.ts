import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { BackupDatabase } from './progress-backup';
import type { ProgressCloud, CloudBackup, CloudPublication } from '../../modules/progress-cloud';
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
  const heads = new Map<string, CloudPublication>();
  const payloads = new Map<string, string>();
  const cloud: ProgressCloud = { account: async () => ({ status: 'available', scope: 'account-a' }), list: async scope => heads.has(scope) ? [heads.get(scope)!] : [],
    read: async (_, id) => { const json = payloads.get(id); if (!json) throw Error('progress-cloud-conflict'); return json; }, publish: async (scope, revision, json, base) => {
      if ((heads.get(scope)?.token ?? '') !== base) throw Error('progress-cloud-conflict');
      published.push(json); const result = publication(revision, `published-${published.length}`);
      heads.set(scope, result); payloads.set(result.id, json); return result;
    },
    cleanup: async (scope, base) => {
      const head = heads.get(scope);
      if (head && head.token !== base) throw Error('progress-cloud-conflict');
      if (head) heads.set(scope, { ...head, cleanupPending: false });
      return false;
    },
    stop: async () => {}, addListener: () => ({ remove() {} }) };
  const sync = new ProgressSync(profiles, cloud);
  t.after(() => sync.dispose());
  return { profiles, cloud, sync, published, open, heads, payloads };
}
const publication = (revision: number, id = 'published-2'): CloudPublication => ({ id, token: id, revision, legacy: false, createdAt: '', cleanupPending: false });
const backup = (id = 'remote'): CloudBackup => ({ id, token: id, revision: 90, legacy: false, createdAt: '' });
const drain = () => new Promise<void>(resolve => setImmediate(resolve));

for (const interrupted of [false, true]) test(`cloud choice durably retires older native pending intent after newer local edits; interrupted=${interrupted}`, async t => {
  const { sync, profiles, cloud, heads, payloads, open, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":1.5}');
  const loserRevision = profiles.current().revision();
  // Native uploaded this revision, then lost the head CAS. A subsequent local
  // edit means current revision/bytes cannot identify the displaced upload.
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  assert.ok(profiles.current().revision() > loserRevision);
  const source = profiles.store('remote-source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', { ...publication(90, 'winner'), pendingPublication: 'uploaded-loser' } as CloudPublication);
  payloads.set('winner', source.exportBackup());
  let calls = 0;
  Object.assign(cloud, { cleanup: async (scope: string, base: string, abandoned: string | null) => {
    calls++; assert.equal(scope, 'account-a'); assert.equal(base, 'winner'); assert.equal(abandoned, 'uploaded-loser');
    assert.equal(profiles.account(scope)!.base, 'winner');
    assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":2}');
    if (interrupted && calls === 1) throw Error('progress-cloud-offline');
    heads.set(scope, publication(90, 'winner')); return false;
  } });
  await sync.retry(); await sync.resolveConflict('cloud', sync.getSnapshot().conflict!.token);
  assert.equal(calls, 1); assert.equal(published.length, 1);
  assert.equal(profiles.current().pending(), false);
  assert.equal(sync.getSnapshot().cleanupPending, interrupted);
  if (interrupted) {
    sync.dispose(); const reopened = new ProgressProfiles(open, () => 'unexpected');
    const next = new ProgressSync(reopened, cloud); t.after(() => next.dispose());
    await next.refreshAccount(); assert.equal(calls, 2); assert.equal(next.getSnapshot().cleanupPending, false);
    assert.equal(published.length, 1);
  }
});

test('restart after atomic cloud activation but before bridge entry resumes exact abandonment', async t => {
  const { sync, profiles, cloud, heads, payloads, open, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', { ...publication(90, 'winner'), pendingPublication: 'older-upload' });
  payloads.set('winner', source.exportBackup());
  const select = profiles.select.bind(profiles);
  profiles.select = (...args) => { select(...args); if (args[3] === 'winner') throw Error('simulated process exit after commit'); };
  let calls = 0; cloud.cleanup = async (scope, base, abandoned) => {
    calls++; assert.equal(scope, 'account-a'); assert.equal(base, 'winner'); assert.equal(abandoned, 'older-upload');
    heads.set(scope, publication(90, 'winner')); return false;
  };
  await sync.retry(); await sync.resolveConflict('cloud', sync.getSnapshot().conflict!.token);
  assert.equal(calls, 0); assert.equal(profiles.account('account-a')!.abandoned, 'older-upload');
  assert.equal(profiles.account('account-a')!.cleanup, 1);
  sync.dispose(); const reopened = new ProgressProfiles(open, () => 'unexpected');
  const next = new ProgressSync(reopened, cloud); t.after(() => next.dispose());
  await next.refreshAccount(); assert.equal(calls, 1); assert.equal(published.length, 1);
  assert.equal(reopened.account('account-a')!.abandoned, null);
  assert.equal(next.getSnapshot().cleanupPending, false);
});

test('late cleanup after account replacement cannot clear the original durable marker', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', { ...publication(90, 'winner'), pendingPublication: 'older-upload' });
  payloads.set('winner', source.exportBackup());
  const cleanup = deferred<boolean>(), started = deferred<void>();
  cloud.cleanup = () => { started.resolve(); return cleanup.promise; };
  await sync.retry(); const choice = sync.resolveConflict('cloud', sync.getSnapshot().conflict!.token);
  await started.promise;
  cloud.account = async () => ({ status: 'no-account' }); await sync.refreshAccount();
  cleanup.resolve(false); await choice;
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.account('account-a')!.abandoned, 'older-upload');
  assert.equal(profiles.account('account-a')!.cleanup, 1);
});

test('canonical equality adopts winner and retires displaced native intent without another progress version', async t => {
  const { sync, profiles, cloud, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', { ...publication(90, 'same-winner'), pendingPublication: 'older-upload' });
  payloads.set('same-winner', profiles.current().exportBackup());
  let calls = 0; cloud.cleanup = async (_, base, abandoned) => {
    calls++; assert.equal(base, 'same-winner'); assert.equal(abandoned, 'older-upload'); return false;
  };
  await sync.retry(); assert.equal(calls, 1); assert.equal(published.length, 1);
  assert.equal(profiles.current().pending(), false); assert.equal(profiles.account('account-a')!.abandoned, null);
});

for (const transition of ['disable', 'account-change'] as const) test(`delayed same-base cleanup cannot publish newer local edits after ${transition}`, async t => {
  const { sync, profiles, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.select(profiles.id(), 'account-a', true, 'published-1', true, 'older-upload');
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const cleanup = deferred<boolean>(), started = deferred<void>();
  cloud.cleanup = () => { started.resolve(); return cleanup.promise; };
  const retry = sync.retry(); await started.promise;
  if (transition === 'disable') sync.disable();
  else { cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.refreshAccount(); }
  const snapshot = sync.getSnapshot(); cleanup.resolve(false); await retry;
  assert.equal(published.length, 1); assert.deepEqual(sync.getSnapshot(), snapshot);
  assert.equal(profiles.account('account-a')!.abandoned, 'older-upload');
  assert.equal(profiles.store(profiles.account('account-a')!.profile).pending(), true);
});

test('first recovery local choice imports guest and legacy preferences into a durable account profile', async t => {
  const { sync: unused, profiles: original, cloud, open, published } = fixture(t);
  unused.dispose();
  const profiles = new ProgressProfiles(open, () => 'imported-account', key => key === 'settings' ? '{"mode":"manual","rate":0.75}' : null);
  const sync = new ProgressSync(profiles, cloud); t.after(() => sync.dispose());
  const source = original.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  const read = deferred<string>(); cloud.list = async () => [backup()]; cloud.read = () => read.promise;
  cloud.publish = async (_, revision, json, base) => {
    assert.equal(base, 'remote'); published.push(json); return publication(revision, 'chosen-local');
  };
  await sync.refreshAccount(); const restoring = sync.restore(sync.getSnapshot().backups[0]!.id);
  profiles.current().journal.save('sample-v1', session());
  read.resolve(source.exportBackup()); await restoring;
  const conflict = sync.getSnapshot().conflict!; assert.ok(conflict);
  const guest = profiles.current(), guestRevision = guest.revision(); let guards = 0;
  sync.beforeSwitch(() => { guards++; });
  await sync.resolveConflict('local', conflict.token);
  assert.equal(profiles.id(), 'imported-account');
  assert.equal(profiles.account('account-a')?.profile, 'imported-account');
  assert.equal(profiles.account('account-a')?.base, 'chosen-local');
  assert.equal(sync.getSnapshot().enabled, true); assert.equal(sync.getSnapshot().hasProfile, true);
  assert.equal(sync.getSnapshot().conflict, null); assert.equal(profiles.current().pending(), false);
  assert.equal(guest.pending(), true); assert.equal(guest.revision(), guestRevision);
  assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":0.75}');
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1)?.runId, 'finished');
  assert.equal(JSON.parse(published[0]!).tables.preferences[0].value, '{"mode":"manual","rate":0.75}');
  assert.equal(guards, 1);
  const reopened = new ProgressProfiles(open, () => 'unexpected');
  assert.equal(reopened.account('account-a')?.base, 'chosen-local');
});

for (const state of ['matching-head', 'empty-cloud', 'unknown-base-empty-cloud'] as const) for (const recovery of ['timer', 'manual'] as const) test(`successful clean ${state} ${recovery} reconciliation clears offline error and stops retries`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, profiles, cloud, heads, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  if (state !== 'matching-head') {
    heads.clear(); profiles.acknowledge('account-a', '', false);
    if (state === 'unknown-base-empty-cloud') open('progress-profiles-v1').run('UPDATE profiles SET base=NULL');
  }
  const list = cloud.list;
  cloud.list = async () => { throw Error('progress-cloud-offline'); };
  await sync.retry(); assert.equal(sync.getSnapshot().error, 'progress-cloud-offline');
  let calls = 0; cloud.list = async scope => { calls++; return list(scope); };
  if (recovery === 'timer') { t.mock.timers.tick(60_000); await drain(); }
  else await sync.retry();
  assert.equal(sync.getSnapshot().error, null);
  assert.equal(sync.getSnapshot().pending, false); assert.equal(sync.getSnapshot().ready, true);
  assert.equal(calls, 1);
  t.mock.timers.tick(180_000); await drain(); assert.equal(calls, 1);
});

for (const failure of ['checkpoint-change', 'mapping-failure'] as const) test(`first recovery local choice preserves guest on ${failure}`, async t => {
  const { sync, profiles, cloud, open, published } = fixture(t);
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  const read = deferred<string>(); cloud.list = async () => [backup()]; cloud.read = () => read.promise;
  await sync.refreshAccount(); const restoring = sync.restore(sync.getSnapshot().backups[0]!.id);
  profiles.current().journal.save('sample-v1', session());
  read.resolve(source.exportBackup()); await restoring;
  const conflict = sync.getSnapshot().conflict!;
  if (failure === 'checkpoint-change') sync.beforeSwitch(() => profiles.current().journal.save('sample-v1', { ...session(), confirmed: 1 }));
  else open('progress-profiles-v1').exec("CREATE TRIGGER deny_mapping BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'disk test'); END");
  await sync.resolveConflict('local', conflict.token);
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.account('account-a'), undefined);
  assert.equal(profiles.current().pending(), true); assert.equal(published.length, 0);
  if (failure === 'checkpoint-change') assert.notEqual(sync.getSnapshot().conflict?.token, conflict.token);
  else assert.equal(sync.getSnapshot().error, 'progress-cloud-storage');
});
const session = () => createSession({ runId: 'finished', stage: 1, phraseCount: 1, mode: 'manual', rate: 1 });
for (const code of ['accountChanged', 'offline', 'quota', 'permission'] as const) {
  test(`native wrapped ${code} preserves the actionable error without exposing its wrapper`, async t => {
    const { sync, cloud, profiles, published } = fixture(t);
    cloud.list = async () => { throw Error(`Calling the 'list' function has failed\n→ Caused by: progress-cloud-${code}`); };
    await sync.refreshAccount();
    assert.equal(sync.getSnapshot().error, `progress-cloud-${code}`);
    assert.equal(sync.getSnapshot().ready, false);
    assert.equal(profiles.id(), 'guest');
    assert.equal(published.length, 0);
  });
}

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('a clean account adopts changed cloud settings without marking restored data pending', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const remote = profiles.store('remote-source');
  remote.saveValue('settings', '{"mode":"manual","rate":2}');
  cloud.list = async () => [{ id: 'new', token: 'new', legacy: false, createdAt: '', revision: 700 }];
  cloud.read = async () => remote.exportBackup();
  await sync.refreshAccount();
  assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":2}');
  assert.equal(profiles.current().pending(), false);
});

for (const choice of ['local', 'cloud'] as const) test(`both dirty stays untouched until confirmed ${choice} selection`, async t => {
  const { sync, profiles, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const displaced = profiles.id();
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const remote = profiles.store('source'); remote.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', publication(700, 'other-device')); payloads.set('other-device', remote.exportBackup());
  await sync.refreshAccount();
  const conflict = sync.getSnapshot().conflict!;
  assert.ok(conflict); assert.equal(published.length, 1);
  assert.equal(profiles.id(), displaced);
  assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":3}');
  await sync.resolveConflict(choice, conflict.token);
  assert.equal(sync.getSnapshot().conflict, null);
  assert.equal(profiles.current().readValue('settings'), choice === 'local' ? '{"mode":"manual","rate":3}' : '{"mode":"manual","rate":2}');
  assert.equal(profiles.current().pending(), false);
  assert.equal(profiles.store(displaced).readValue('settings'), '{"mode":"manual","rate":3}');
});

test('a server race after confirmation exposes a fresh actionable conflict', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
  await sync.refreshAccount(); const first = sync.getSnapshot().conflict!;
  cloud.publish = async () => { heads.set('account-a', publication(71, 'raced')); throw Error('progress-cloud-conflict'); };
  await sync.resolveConflict('local', first.token);
  assert.notEqual(sync.getSnapshot().conflict?.token, first.token);
  assert.equal(sync.getSnapshot().conflict?.backups[0]?.token, 'raced');
});

for (const choice of ['local', 'cloud'] as const) for (const side of ['local', 'cloud'] as const) {
  test(`${choice} confirmation is invalidated when ${side} changes in the dialog`, async t => {
    const { sync, profiles, heads, payloads, published } = fixture(t);
    await sync.refreshAccount(); await sync.enable(false);
    profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
    const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
    heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
    await sync.refreshAccount(); const before = profiles.id(), first = sync.getSnapshot().conflict!;
    if (side === 'local') profiles.current().saveValue('settings', '{"mode":"manual","rate":0.75}');
    else heads.set('account-a', publication(71, 'changed'));
    await sync.resolveConflict(choice, first.token);
    assert.equal(profiles.id(), before); assert.equal(published.length, 1);
    assert.ok(sync.getSnapshot().conflict); assert.notEqual(sync.getSnapshot().conflict!.token, first.token);
  });
}

for (const cause of ['delayed-read', 'checkpoint'] as const) test(`${cause} local change blocks clean adoption`, async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false); const original = profiles.id();
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  const json = source.exportBackup(); heads.set('account-a', publication(70, 'other')); payloads.set('other', json);
  const read = deferred<string>(); let guards = 0;
  if (cause === 'delayed-read') cloud.read = () => read.promise;
  else sync.beforeSwitch(() => { guards++; profiles.current().saveValue('settings', '{"mode":"manual","rate":3}'); });
  const refreshing = sync.refreshAccount(); await drain();
  if (cause === 'delayed-read') { profiles.current().saveValue('settings', '{"mode":"manual","rate":3}'); read.resolve(json); }
  await refreshing;
  assert.equal(profiles.id(), original); assert.ok(sync.getSnapshot().conflict);
  assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":3}');
  if (cause === 'checkpoint') assert.equal(guards, 1);
});

test('disabled backup keeps local data and enabling reconciles before any publication', async t => {
  const { sync, profiles, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false); sync.disable();
  const original = profiles.id(); profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
  await sync.refreshAccount(); await sync.retry();
  assert.equal(profiles.id(), original); assert.equal(published.length, 1); assert.equal(sync.getSnapshot().conflict, null);
  await sync.enable(false); assert.ok(sync.getSnapshot().conflict); assert.equal(published.length, 1);
});

test('nonempty rewards and unfinished checkpoints are restored with no new XP or autoplay', async t => {
  const { sync, profiles, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const source = profiles.store('source');
  source.journal.save('sample-v1', { ...session(), confirmed: 3, phase: 'complete' }, { language: 'en', book: 'sample' });
  source.journal.save('sample-v1', { ...session(), runId: 'unfinished', stage: 2, confirmed: 1, audioSeconds: 1.25, phase: 'listening', running: true });
  heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
  await sync.refreshAccount(); await sync.refreshAccount();
  assert.equal(profiles.current().journal.progress.summary('en').xp, 10);
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 1);
  assert.equal(profiles.current().journal.load('sample-v1', 2, 1)?.audioSeconds, 1.25);
  assert.equal(profiles.current().journal.load('sample-v1', 2, 1)?.running, false);
});

test('a failed mapping commit preserves active history and adopted base atomically', async t => {
  const { sync, profiles, heads, payloads, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false); const original = profiles.id(), base = profiles.account('account-a')!.base;
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
  // Account activation writes the pointer too; fail only selection of a new profile.
  open('progress-profiles-v1').exec("CREATE TRIGGER deny_new_pointer BEFORE UPDATE ON active_profile WHEN NEW.profile != OLD.profile BEGIN SELECT RAISE(ABORT, 'disk test'); END");
  await sync.refreshAccount();
  assert.equal(profiles.id(), original); assert.equal(profiles.account('account-a')!.base, base);
  assert.equal(sync.getSnapshot().error, 'progress-cloud-storage');
});

test('cloud change during a confirmed download invalidates the displayed decision', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.id(); profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
  await sync.refreshAccount(); const conflict = sync.getSnapshot().conflict!;
  const read = deferred<string>(); cloud.read = () => read.promise;
  const resolving = sync.resolveConflict('cloud', conflict.token); await drain();
  heads.set('account-a', publication(71, 'latest')); read.resolve(source.exportBackup()); await resolving;
  assert.equal(profiles.id(), original);
  assert.notEqual(sync.getSnapshot().conflict?.token, conflict.token);
  assert.equal(sync.getSnapshot().conflict?.backups[0]?.token, 'latest');
});

test('restart after server ack and failed base save recognizes identical data without replacing profile', async t => {
  const { sync, profiles, cloud, open, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.id(); profiles.current().saveValue('settings', '{"mode":"manual","rate":2}');
  open('progress-profiles-v1').exec("CREATE TRIGGER deny_base BEFORE UPDATE OF base ON profiles BEGIN SELECT RAISE(ABORT, 'disk test'); END");
  await sync.retry(); assert.equal(profiles.current().pending(), true); assert.equal(published.length, 2);
  sync.dispose(); open('progress-profiles-v1').exec('DROP TRIGGER deny_base');
  const reopened = new ProgressProfiles(open, () => 'unexpected-profile'); const next = new ProgressSync(reopened, cloud);
  t.after(() => next.dispose()); await next.refreshAccount();
  assert.equal(reopened.id(), original); assert.equal(reopened.current().pending(), false);
  assert.equal(reopened.account('account-a')!.base, 'published-2'); assert.equal(published.length, 2);
});

test('old account mappings migrate without assuming unknown base means empty cloud', async t => {
  const { profiles, cloud, sync, open, published } = fixture(t);
  open('progress-profiles-v1').exec('DROP TABLE profiles; CREATE TABLE profiles(scope TEXT PRIMARY KEY,profile TEXT NOT NULL,enabled INTEGER NOT NULL);');
  open('progress-profiles-v1').run('INSERT INTO profiles VALUES(?,?,?)', 'account-a', 'old-account', 1);
  profiles.store('old-account').saveValue('settings', '{"mode":"manual","rate":3}');
  const reopened = new ProgressProfiles(open, () => 'unexpected-profile');
  cloud.list = async () => [backup()]; cloud.read = async () => profiles.store('guest').exportBackup();
  sync.dispose(); const next = new ProgressSync(reopened, cloud); t.after(() => next.dispose());
  await next.refreshAccount();
  assert.equal(reopened.account('account-a')!.base, null); assert.equal(reopened.id(), 'old-account');
  assert.ok(next.getSnapshot().conflict); assert.equal(published.length, 0);
});

test('clean cleanup retries persist across restart and do not churn a fully cleaned head', async t => {
  const { sync, profiles, cloud, open, heads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const publish = cloud.publish;
  cloud.publish = async (...args) => { const result = { ...await publish(...args), cleanupPending: true }; heads.set(args[0], result); return result; };
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}'); await sync.retry();
  assert.equal(sync.getSnapshot().cleanupPending, true); assert.equal(profiles.current().pending(), false);
  assert.equal(profiles.account('account-a')!.cleanup, 1);
  sync.dispose(); cloud.publish = publish;
  const reopened = new ProgressProfiles(open, () => 'unexpected'); const next = new ProgressSync(reopened, cloud); t.after(() => next.dispose());
  await next.refreshAccount();
  assert.equal(published.length, 2); assert.equal(next.getSnapshot().cleanupPending, false);
  await next.refreshAccount(); await next.retry(); assert.equal(published.length, 2);
});

test('cleanup reported by a fresh native reader is retried for a clean matching profile', async t => {
  const { sync, profiles, heads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  heads.set('account-a', { ...heads.get('account-a')!, cleanupPending: true });
  assert.equal(profiles.account('account-a')!.cleanup, 0);
  await sync.refreshAccount();
  assert.equal(published.length, 1); assert.equal(sync.getSnapshot().cleanupPending, false);
});

for (const choice of ['cloud', 'local'] as const) test(`legacy multiple candidates require explicit ${choice} migration against the whole head token`, async t => {
  const { sync, profiles, cloud, published } = fixture(t);
  const local = profiles.create(); profiles.store(local).saveValue('settings', '{"mode":"manual","rate":3}');
  profiles.select(local, 'account-a');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  const legacy = ['older', 'newer'].map(id => ({ ...backup(id), token: 'full-legacy-fingerprint', legacy: true }));
  let current = legacy;
  cloud.list = async () => current; cloud.read = async () => source.exportBackup();
  cloud.publish = async (_, revision, json, base) => {
    assert.equal(base, 'full-legacy-fingerprint'); published.push(json);
    const ack = publication(revision, 'migrated'); current = [ack]; return ack;
  };
  await sync.refreshAccount(); const conflict = sync.getSnapshot().conflict!;
  assert.ok(conflict); assert.equal(published.length, 0);
  await sync.resolveConflict(choice, conflict.token, conflict.backups[0]!.id);
  assert.equal(published.length, 1); assert.equal(sync.getSnapshot().backups.length, 1);
  assert.equal(sync.getSnapshot().backups[0]!.legacy, false);
  assert.equal(profiles.current().readValue('settings'), choice === 'cloud' ? '{"mode":"manual","rate":2}' : '{"mode":"manual","rate":3}');
  assert.equal(profiles.account('account-a')!.base, 'migrated');
});

test('successful recovery calls checkpoint guard once and binds revision before download', async t => {
  const { sync, profiles, cloud } = fixture(t);
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  cloud.list = async () => [backup()]; cloud.read = async () => source.exportBackup();
  await sync.refreshAccount(); let checkpoints = 0; sync.beforeSwitch(() => { checkpoints++; });
  await sync.restore(sync.getSnapshot().backups[0]!.id);
  assert.equal(checkpoints, 1); assert.equal(profiles.current().readValue('settings'), '{"mode":"manual","rate":2}');
});

test('a pending conflict selection cannot activate after account replacement', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}');
  const source = profiles.store('source'); source.saveValue('settings', '{"mode":"manual","rate":2}');
  heads.set('account-a', publication(70, 'other')); payloads.set('other', source.exportBackup());
  await sync.refreshAccount(); const conflict = sync.getSnapshot().conflict!;
  const read = deferred<string>(); cloud.read = () => read.promise;
  const resolving = sync.resolveConflict('cloud', conflict.token); await drain();
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.refreshAccount();
  read.resolve(source.exportBackup()); await resolving;
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.account('account-b'), undefined);
});

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
  cloud.list = async () => [backup()];
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
  cloud.list = async () => [backup()]; cloud.read = () => read.promise;
  await sync.refreshAccount(); const old = sync.restore(sync.getSnapshot().backups[0]!.id);
  cloud.account = async () => ({ status: 'no-account' }); await sync.refreshAccount();
  read.resolve(profiles.store('guest').exportBackup()); await old;
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.account('account-a'), undefined);
});

test('late publication cannot acknowledge newer edits or a different account; unknown retains local history', async t => {
  const { sync, cloud, profiles } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.current(); original.saveValue('settings', '{"mode":"manual","rate":2}');
  const publish = deferred<CloudPublication>(); const revision = original.revision(); cloud.publish = () => publish.promise;
  const old = sync.retry();
  await drain();
  original.saveValue('settings', '{"mode":"manual","rate":3}');
  cloud.account = async () => ({ status: 'unknown' }); await sync.refreshAccount();
  assert.equal(profiles.current(), original);
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.refreshAccount();
  publish.resolve(publication(revision)); await old;
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
  const { sync, profiles, cloud, published, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const store = profiles.current(); store.saveValue('settings', '{"mode":"manual","rate":2}');
  const result = deferred<CloudPublication>(); cloud.publish = () => result.promise;
  const revision = store.revision(); const flight = sync.retry();
  await drain();
  store.saveValue('settings', '{"mode":"manual","rate":3}'); sync.changed(); sync.changed();
  heads.set('account-a', publication(revision)); payloads.set('published-2', store.exportBackup());
  result.resolve(publication(revision)); await flight;
  assert.equal(store.pending(), true);
  cloud.publish = async (_, revision, json) => { published.push(json); return publication(revision, 'published-3'); };
  t.mock.timers.tick(59_999); await Promise.resolve(); assert.equal(published.length, 1);
  t.mock.timers.tick(1); await drain();
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
  sync.setActive(true); t.mock.timers.tick(0); await drain();
  assert.equal(published.length, 2);
});

test('invalid remote data and failed pointer commits leave the existing guest and consent untouched', async t => {
  const { sync, cloud, profiles, open, published } = fixture(t);
  profiles.current().journal.save('sample-v1', session());
  cloud.list = async () => [backup()];
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
  cloud.publish = async (_, revision, json) => { published.push(json); return publication(revision); };
  t.mock.timers.tick(60_000); await drain();
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
  t.mock.timers.tick(1); await drain();
  assert.equal(lookups, 2); assert.equal(sync.getSnapshot().status, 'available');
  t.mock.timers.tick(0); await drain();
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
