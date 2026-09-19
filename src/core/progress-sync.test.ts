import { test, type TestContext } from 'node:test';
import { Player } from './player';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { BackupDatabase } from './progress-backup';
import type { ProgressCloud, CloudBackup, CloudPublication } from '../../modules/progress-cloud';

import { createLegacySession as createSession } from '../../tests/legacy-session';
import { enableAutomaticBackup } from './enable-backup';
import { encodeEnvelope, emptyProgress } from './progress-envelope';
import { createSession as createFreshSession } from './session';

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
  const preferences = new Map<string, string>();
  const profiles = new ProgressProfiles(open, () => `profile-${++sequence}`,
    key => preferences.get(key) ?? null, (key, value) => { preferences.set(key, value); });
  const published: string[] = [];
  const heads = new Map<string, CloudPublication>();
  const payloads = new Map<string, string>();
  const cloud: ProgressCloud = { account: async () => ({ status: 'available', scope: 'account-a' }), list: async scope => heads.has(scope) ? [heads.get(scope)!] : [],
    read: async (_, id) => { const json = payloads.get(id); if (!json) throw Error('progress-cloud-conflict'); return json; }, publish: async (scope, revision, json, base) => {
      if ((heads.get(scope)?.token ?? '') !== base) throw Error('progress-cloud-conflict');
      published.push(json); const result = { ...publication(revision, `published-${published.length}`), resetGeneration: JSON.parse(json).generation };
      heads.set(scope, result); payloads.set(result.id, json); return result;
    },
    cleanup: async (scope, base) => {
      const head = heads.get(scope);
      if (head && head.token !== base) throw Error('progress-cloud-conflict');
      if (head) heads.set(scope, { ...head, cleanupPending: false });
      return false;
    },
    reset: async (scope, request, expected, json) => {
      const current = heads.get(scope);
      if (current && (current.resetGeneration ?? '') !== expected) return current;
      const result = { ...publication(0, request), resetGeneration: request };
      heads.set(scope, result); payloads.set(result.id, json); return result;
    }, discardLocal: async () => {},
    stop: async () => {}, addListener: () => ({ remove() {} }) };
  const sync = new ProgressSync(profiles, cloud);
  t.after(() => sync.dispose());
  return { profiles, cloud, sync, published, open, heads, payloads };
}
const publication = (revision: number, id = 'published-2'): CloudPublication => ({ id, token: id, revision, legacy: false, createdAt: '', cleanupPending: false });
const backup = (id = 'remote'): CloudBackup => ({ id, token: id, revision: 90, legacy: false, createdAt: '' });
const drain = () => new Promise<void>(resolve => setImmediate(resolve));

// #52 journeys use real player/journal/SQLite boundaries. Only Apple transport
// and audio are fixtures; these are not TestFlight or physical-device evidence.
test('recovery journey: reinstall restores uploaded cycles only, then reconnect converges without duplicate XP', async t => {
  const players: Player[] = [];
  // Node after hooks are FIFO: checkpoint/dispose before fixture databases close.
  t.after(() => players.forEach(player => player.dispose()));
  const original = fixture(t);
  await original.sync.refreshAccount(); await original.sync.enable(false);
  const initial = createFreshSession({ runId: 'journey-run', stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
  const journal = original.profiles.current().journal;
  const player = new Player(initial, {
    prepare: async () => {}, play() {}, pause() {}, position: () => 2.5, dispose() {},
  }, journal.createWriter('sample-v1', initial, { language: 'english', book: 'sample' }), () => 0, () => {});
  players.push(player);
  await player.resume(); player.audioEnded(4); await player.confirm(); player.pause();
  await original.sync.retry();
  assert.equal(journal.progress.summary('english').xp, 1);
  assert.equal(original.profiles.current().pending(), false);

  const onlineList = original.cloud.list;
  original.cloud.list = async () => { throw Error('progress-cloud-offline'); };
  await player.resume(); player.audioEnded(4); await player.confirm(); player.pause();
  await original.sync.retry();
  assert.equal(journal.progress.summary('english').xp, 2);
  assert.equal(original.profiles.current().pending(), true);
  assert.equal(journal.load('sample-v1', 1, 2)?.audioSeconds, 2.5);
  player.dispose(); original.sync.dispose();

  // Relaunch keeps the installation's database; reinstall below uses an empty one.
  const reopened = new ProgressProfiles(original.open, () => 'unexpected-profile');
  const relaunched = new ProgressSync(reopened, original.cloud); t.after(() => relaunched.dispose());
  await relaunched.refreshAccount();
  assert.equal(reopened.current().journal.progress.summary('english').xp, 2);
  assert.equal(reopened.current().journal.load('sample-v1', 1, 2)?.confirmed, 2);
  assert.equal(reopened.current().journal.load('sample-v1', 1, 2)?.running, false);

  original.cloud.list = onlineList;
  const clean = fixture(t); clean.sync.dispose();
  const restored = new ProgressSync(clean.profiles, original.cloud); t.after(() => restored.dispose());
  await restored.refreshAccount(); await restored.enable(false);
  assert.equal(clean.profiles.current().journal.progress.summary('english').xp, 1);
  assert.equal(clean.profiles.current().journal.load('sample-v1', 1, 2)?.confirmed, 1);
  assert.equal(clean.profiles.current().journal.completions('sample-v1', 1), 0);

  await relaunched.retry(); await restored.retry(); await relaunched.retry();
  for (const profiles of [reopened, clean.profiles]) {
    assert.equal(profiles.current().journal.progress.summary('english').xp, 2);
    assert.equal(profiles.current().journal.load('sample-v1', 1, 2)?.confirmed, 2);
    assert.equal(profiles.current().journal.load('sample-v1', 1, 2)?.audioSeconds, 2.5);
    assert.equal(profiles.current().journal.completions('sample-v1', 1), 0);
    assert.equal(profiles.current().pending(), false);
  }
  assert.equal(reopened.current().exportBackup(), clean.profiles.current().exportBackup());
});

test('recovery journey: cloud deletion fences offline learning while new learning survives reinstall and account switches', async t => {
  const players: Player[] = [];
  t.after(() => players.forEach(player => player.dispose()));
  const owner = fixture(t);
  await owner.sync.refreshAccount(); await owner.sync.enable(false);
  const practice = async (profiles: ProgressProfiles, runId: string) => {
    const initial = createFreshSession({ runId, stage: 1, phraseCount: 2, mode: 'manual', rate: 1 });
    const player = new Player(initial, {
      prepare: async () => {}, play() {}, pause() {}, position: () => 1, dispose() {},
    }, profiles.current().journal.createWriter('sample-v1', initial, { language: 'english', book: 'sample' }), () => 0, () => {});
    players.push(player);
    await player.resume(); player.audioEnded(3); await player.confirm(); player.pause();
    return player;
  };
  await practice(owner.profiles, 'before-deletion'); await owner.sync.retry();

  const stale = fixture(t); stale.sync.dispose();
  let online = true;
  const oldDevice = new ProgressSync(stale.profiles, { ...owner.cloud, list: async scope => {
    if (!online) throw Error('progress-cloud-offline');
    return owner.cloud.list(scope);
  } });
  t.after(() => oldDevice.dispose());
  await oldDevice.refreshAccount(); await oldDevice.enable(false);
  online = false;
  const stalePlayer = await practice(stale.profiles, 'offline-before-deletion');
  await oldDevice.retry();
  assert.equal(stale.profiles.current().journal.progress.summary('english').xp, 2);
  assert.equal(stale.profiles.current().pending(), true);

  await owner.sync.deleteCloud();
  assert.equal(owner.profiles.current().journal.progress.summary('english').xp, 0);
  assert.equal(owner.sync.getSnapshot().deletion, null);
  await practice(owner.profiles, 'after-deletion'); await owner.sync.refresh();
  online = true; await oldDevice.retry();
  stalePlayer.pause(); // A screen captured before deletion cannot resurrect its writer.
  assert.equal(stalePlayer.error, 'save');
  assert.equal(stale.profiles.current().journal.progress.summary('english').xp, 1);
  assert.equal(stale.profiles.current().journal.load('sample-v1', 1, 2)?.runId, 'after-deletion');
  await oldDevice.retry();

  const clean = fixture(t); clean.sync.dispose();
  let account = 'account-a';
  const restored = new ProgressSync(clean.profiles, { ...owner.cloud,
    account: async () => ({ status: 'available', scope: account }),
  });
  t.after(() => restored.dispose());
  await restored.refreshAccount(); await restored.enable(false);
  assert.equal(clean.profiles.current().journal.progress.summary('english').xp, 1);
  assert.equal(clean.profiles.current().journal.load('sample-v1', 1, 2)?.runId, 'after-deletion');
  account = 'account-b'; await restored.accountChanged(); await restored.enable(false);
  assert.equal(clean.profiles.current().journal.progress.summary('english').xp, 0);
  assert.equal(clean.profiles.current().journal.load('sample-v1', 1, 2), null);
  account = 'account-a'; await restored.accountChanged(); await restored.retry();
  assert.equal(clean.profiles.current().journal.progress.summary('english').xp, 1);
  assert.equal(clean.profiles.current().journal.load('sample-v1', 1, 2)?.runId, 'after-deletion');
  assert.equal(clean.profiles.current().exportBackup(), owner.profiles.current().exportBackup());
});

test('divergent offline learning merges automatically without remounting the profile', async t => {
  const { sync, profiles, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const id = profiles.id(); let pauses = 0;
  sync.beforeSwitch(() => { pauses++; });
  profiles.current().journal.save('sample-v1', { ...session(), runId: 'local', confirmed: 3, phase: 'complete' });
  const source = profiles.store('source');
  source.journal.save('sample-v1', { ...session(), runId: 'remote', confirmed: 3, phase: 'complete' });
  heads.set('account-a', publication(50, 'remote')); payloads.set('remote', source.exportBackup());
  await sync.retry();
  assert.equal(profiles.id(), id); assert.equal(pauses, 0);
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 2);
  assert.equal(sync.getSnapshot().error, null);
  assert.equal(sync.getSnapshot().conflict, null);
  assert.equal(profiles.current().pending(), false);
});

test('first enable merges account cloud history without a restore choice or guest import', async t => {
  const { sync, profiles, heads, payloads } = fixture(t);
  profiles.store('guest').journal.save('sample-v1', { ...session(), runId: 'guest' });
  const source = profiles.store('source');
  source.journal.save('sample-v1', { ...session(), runId: 'remote', confirmed: 3, phase: 'complete' });
  heads.set('account-a', publication(50, 'remote')); payloads.set('remote', source.exportBackup());
  await sync.refreshAccount(); await sync.enable(false);
  assert.notEqual(profiles.id(), 'guest');
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 1);
  assert.equal(profiles.store('guest').journal.load('sample-v1', 1, 1)?.runId, 'guest');
  assert.equal(sync.getSnapshot().error, null);
});

test('clean active profiles poll remote changes without generating extra revisions or publications', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, profiles, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const revision = profiles.current().revision(), list = cloud.list; let reads = 0;
  cloud.list = async scope => { reads++; return list(scope); };
  t.mock.timers.tick(60_000); await drain();
  assert.ok(reads > 0);
  assert.equal(profiles.current().revision(), revision);
  assert.equal(published.length, 1);
});

test('first automatic backup waits for explicit import, separate, or cancel consent', async t => {
  for (const choice of [true, false, null]) {
    const { sync, profiles, published } = fixture(t);
    profiles.saveValue('settings', '{"mode":"manual","rate":2}');
    const guest = profiles.guestBackup();
    await sync.refreshAccount(false);
    let decide!: (value: boolean | null) => void;
    const pending = enableAutomaticBackup(sync, () => new Promise(resolve => { decide = resolve; }));
    await drain();
    assert.equal(profiles.id(), 'guest');
    assert.equal(published.length, 0);
    assert.equal(sync.getSnapshot().enabled, false);
    decide(choice); await pending;
    assert.equal(sync.getSnapshot().enabled, choice !== null);
    assert.equal(profiles.readValue('settings'), choice === false ? '{"mode":"manual","rate":1}' : '{"mode":"manual","rate":2}');
    assert.equal(published.length, choice === null ? 0 : 1);
    assert.equal(profiles.guestBackup(), guest);
  }
});

test('first-enable consent cannot import into an account that changed while the dialog was open', async t => {
  const { sync, profiles, cloud, published } = fixture(t);
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  await sync.refreshAccount(false);
  let decide!: (value: boolean | null) => void;
  const pending = enableAutomaticBackup(sync, () => new Promise(resolve => { decide = resolve; }));
  cloud.account = async () => ({ status: 'available', scope: 'account-b' });
  await sync.refreshAccount(false);
  decide(true); await pending;
  assert.equal(profiles.id(), 'guest');
  assert.equal(published.length, 0);
  assert.equal(sync.getSnapshot().enabled, false);
});

test('CAS losses refetch and merge automatically, with three attempts per pass', async t => {
  const { sync, profiles, cloud, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', { ...session(), runId: 'local', confirmed: 3, phase: 'complete' });
  const source = profiles.store('competitor');
  source.journal.save('sample-v1', { ...session(), runId: 'competing', confirmed: 3, phase: 'complete' });
  const publish = cloud.publish; let attempts = 0;
  cloud.publish = async (...args) => {
    attempts++;
    if (attempts === 1) {
      heads.set('account-a', publication(10, 'competing')); payloads.set('competing', source.exportBackup());
      throw Error('progress-cloud-conflict');
    }
    return publish(...args);
  };
  await sync.retry();
  assert.equal(attempts, 2); assert.equal(profiles.current().journal.completions('sample-v1', 1), 2);
  assert.equal(sync.getSnapshot().error, null); assert.equal(profiles.current().pending(), false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}'); attempts = 0;
  cloud.publish = async () => { attempts++; throw Error('progress-cloud-conflict'); };
  await sync.retry();
  assert.equal(attempts, 3); assert.equal(published.length, 2);
  assert.equal(sync.getSnapshot().error, null); assert.equal(profiles.current().pending(), true);
});

test('manual refresh merges safely while disabled and retains the toggle across restart', async t => {
  const { sync, profiles, heads, payloads, cloud, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false); sync.disable();
  const id = profiles.id();
  profiles.current().journal.save('sample-v1', { ...session(), runId: 'local', confirmed: 3, phase: 'complete' });
  const source = profiles.store('remote');
  source.journal.save('sample-v1', { ...session(), runId: 'remote', confirmed: 3, phase: 'complete' });
  heads.set('account-a', publication(50, 'remote')); payloads.set('remote', source.exportBackup());
  await sync.refresh();
  assert.equal(profiles.id(), id); assert.equal(profiles.current().journal.completions('sample-v1', 1), 2);
  assert.equal(sync.getSnapshot().enabled, false); assert.equal(profiles.account('account-a')!.enabled, 0);
  sync.dispose(); const next = new ProgressSync(new ProgressProfiles(open, () => 'unused'), cloud); t.after(() => next.dispose());
  await next.refreshAccount(); assert.equal(next.getSnapshot().enabled, false);
});

test('network return coalesces with an in-flight pass and respects inactive, off, and disposal', async t => {
  const { sync, cloud, profiles } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const list = cloud.list, waiting = deferred<CloudBackup[]>(); let lookups = 0;
  cloud.list = () => { lookups++; return waiting.promise; };
  sync.networkAvailable(); sync.networkAvailable(); await drain();
  assert.equal(lookups, 1);
  cloud.list = list; waiting.resolve(await list('account-a')); await drain();
  const revision = profiles.current().revision();
  cloud.list = async scope => { lookups++; return list(scope); };
  sync.setActive(false); sync.networkAvailable(); await drain(); assert.equal(lookups, 1);
  sync.disable(); sync.setActive(true); sync.networkAvailable(); await drain(); assert.equal(lookups, 1);
  sync.dispose(); sync.networkAvailable(); await drain(); assert.equal(lookups, 1);
  assert.equal(profiles.current().revision(), revision);
});

test('all legacy payloads validate before any merge and migrate against the complete token', async t => {
  const { sync, profiles, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const before = profiles.current().exportBackup();
  const source = profiles.store('legacy');
  source.journal.save('sample-v1', { ...session(), runId: 'legacy', confirmed: 3, phase: 'complete' });
  let current: CloudBackup[] = ['a', 'b'].map(id => ({ ...backup(id), token: 'legacy-set', legacy: true }));
  cloud.list = async () => current;
  cloud.read = async (_, id) => id === 'a' ? source.exportBackup() : '{';
  await sync.retry();
  assert.equal(profiles.current().exportBackup(), before); assert.equal(published.length, 1);
  assert.equal(sync.getSnapshot().error, 'progress-cloud-corrupt');
  cloud.read = async () => source.exportBackup();
  cloud.publish = async (_, revision, json, base) => {
    assert.equal(base, 'legacy-set'); published.push(json);
    const result = publication(revision, 'union'); current = [result]; return result;
  };
  await sync.retry();
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 1); assert.equal(published.length, 2);
  assert.equal(sync.getSnapshot().error, null);
});

test('a moved head during reading is refetched before stale payloads can enter SQLite', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const source = profiles.store('remote');
  source.journal.save('sample-v1', { ...session(), runId: 'stale', confirmed: 3, phase: 'complete' });
  heads.set('account-a', publication(10, 'stale')); payloads.set('stale', source.exportBackup());
  const read = cloud.read;
  cloud.read = async (scope, id) => {
    if (id === 'stale') {
      heads.set(scope, publication(11, 'latest')); payloads.set('latest', profiles.current().exportBackup());
    }
    return read(scope, id);
  };
  await sync.retry();
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 0);
  assert.equal(profiles.account('account-a')!.base, 'latest');
});

test('late downloaded payload after account change cannot mutate the previous or new profile', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.current(), before = original.exportBackup();
  const read = deferred<string>(); cloud.read = () => read.promise;
  const flight = sync.retry(); await drain();
  cloud.account = async () => ({ status: 'no-account' }); await sync.refreshAccount();
  read.resolve(payloads.get(heads.get('account-a')!.id)!); await flight;
  assert.equal(profiles.id(), 'guest'); assert.equal(original.exportBackup(), before);
});

test('unsupported future data is never overwritten, while local learning remains intact', async t => {
  const { sync, profiles, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session()); const before = profiles.current().exportBackup();
  const future = JSON.parse(before); future.version = 999;
  cloud.list = async () => [backup()]; cloud.read = async () => JSON.stringify(future);
  await sync.retry(); await sync.retry();
  assert.equal(profiles.current().exportBackup(), before); assert.equal(published.length, 1);
  assert.equal(sync.getSnapshot().error, 'progress-cloud-updateRequired');
});

test('identical union adopts exact displaced native intent atomically and resumes cleanup after restart', async t => {
  const { sync, profiles, cloud, heads, payloads, open, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const json = profiles.current().exportBackup(), id = profiles.id();
  heads.set('account-a', { ...publication(50, 'remote'), pendingPublication: 'native-pending-older', cleanupPending: true });
  payloads.set('remote', json);
  const cleanups: (string | null)[] = [];
  cloud.cleanup = async (_, base, abandoned) => {
    assert.equal(base, 'remote'); cleanups.push(abandoned); return true;
  };
  await sync.retry();
  assert.equal(profiles.id(), id); assert.equal(profiles.account('account-a')!.base, 'remote');
  assert.equal(profiles.account('account-a')!.abandoned, 'native-pending-older'); assert.equal(published.length, 1);
  sync.dispose(); const next = new ProgressSync(new ProgressProfiles(open, () => 'unused'), cloud); t.after(() => next.dispose());
  await next.refreshAccount();
  assert.deepEqual(cleanups, ['native-pending-older', 'native-pending-older']);
});

test('late successful publication acknowledges only its captured revision', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const store = profiles.current(); store.saveValue('settings', '{"mode":"manual","rate":2}');
  const waiting = deferred<CloudPublication>(); let sentRevision = 0;
  cloud.publish = async (_, revision) => { sentRevision = revision; return waiting.promise; };
  const flight = sync.retry(); await drain();
  store.saveValue('settings', '{"mode":"manual","rate":3}');
  waiting.resolve(publication(sentRevision)); await flight;
  assert.equal(store.pending(), true); assert.equal(store.readValue('settings'), '{"mode":"manual","rate":3}');
});

for (const first of ['a', 'b'] as const) test(`two installations converge offline XP in ${first}-first reconnect order`, async t => {
  const a = fixture(t), b = fixture(t); b.sync.dispose();
  const second = new ProgressSync(b.profiles, a.cloud); t.after(() => second.dispose());
  await a.sync.refreshAccount(); await a.sync.enable(false);
  await second.refreshAccount(); await second.enable(false);
  for (const [run, store] of [['a-run', a.profiles.current()], ['b-run', b.profiles.current()]] as const) {
    const initial = { ...session(), runId: run };
    const save = store.journal.createWriter('sample-v1', initial, { language: 'english', book: 'sample' });
    const player = new Player(initial, { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} }, save, () => 0, () => {});
    await player.resume(); player.audioEnded(1); await player.confirm(); player.dispose();
    assert.equal(store.journal.progress.summary('english').xp, 1);
  }
  const order = first === 'a' ? [a.sync, second] : [second, a.sync];
  for (const sync of [...order, ...order]) await sync.retry();
  assert.equal(a.profiles.current().journal.progress.summary('english').xp, 2);
  assert.equal(b.profiles.current().journal.progress.summary('english').xp, 2);
  assert.equal(a.profiles.current().exportBackup(), b.profiles.current().exportBackup());
  const count = a.published.length;
  await a.sync.retry(); await second.retry();
  assert.equal(a.published.length, count);
});

test('lost publication reply is recovered by equality without sending a duplicate version', async t => {
  const { sync, profiles, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}');
  const publish = cloud.publish;
  cloud.publish = async (...args) => { await publish(...args); throw Error('progress-cloud-offline'); };
  await sync.retry(); assert.equal(profiles.current().pending(), true); assert.equal(published.length, 2);
  cloud.publish = publish; await sync.retry();
  assert.equal(profiles.current().pending(), false); assert.equal(published.length, 2);
});

test('head disappearance during read retries as contention rather than stopping sync', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const read = cloud.read; let calls = 0;
  cloud.read = async (...args) => {
    if (++calls === 1) throw Error('progress-cloud-conflict');
    return read(...args);
  };
  await sync.retry(); assert.equal(calls, 2); assert.equal(sync.getSnapshot().error, null);
  assert.equal(profiles.current().pending(), false);
});

test('compressed confirmation counts remain canonical across repeated clean polls', async t => {
  const { sync, profiles, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const initial = createSession({ runId: 'long-run', stage: 1, phraseCount: 200, mode: 'manual', rate: 1 });
  const save = profiles.current().journal.createWriter('sample-v1', initial, { language: 'english', book: 'sample' });
  const player = new Player(initial, { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} }, save, () => 0, () => {});
  await player.resume(); player.audioEnded(1); await player.confirm(); player.dispose();
  await sync.retry();
  const before = published.length, revision = profiles.current().revision();
  await sync.retry(); await sync.retry();
  assert.equal(published.length, before); assert.equal(profiles.current().revision(), revision);
});

test('merge disk failure rolls back and reports storage, then retries without losing either history', async t => {
  const { sync, profiles, heads, payloads, open, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const source = profiles.store('remote');
  source.journal.save('sample-v1', { ...session(), runId: 'remote', confirmed: 3, phase: 'complete' });
  heads.set('account-a', publication(90, 'remote')); payloads.set('remote', source.exportBackup());
  const before = profiles.current().exportBackup(), revision = profiles.current().revision();
  open(profiles.id()).exec("CREATE TRIGGER deny_merge BEFORE INSERT ON completions BEGIN SELECT RAISE(ABORT, 'disk'); END");
  await sync.retry();
  assert.equal(sync.getSnapshot().error, 'progress-cloud-storage');
  assert.equal(profiles.current().exportBackup(), before); assert.equal(profiles.current().revision(), revision);
  assert.equal(published.length, 1);
  open(profiles.id()).exec('DROP TRIGGER deny_merge'); await sync.retry();
  assert.equal(sync.getSnapshot().error, null); assert.equal(profiles.current().journal.completions('sample-v1', 1), 1);
});

test('a late cleanup reply after disable cannot clear its durable marker', async t => {
  const { sync, profiles, heads, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  heads.set('account-a', { ...heads.get('account-a')!, cleanupPending: true });
  const cleanup = deferred<boolean>(); cloud.cleanup = () => cleanup.promise;
  const flight = sync.retry(); await drain();
  assert.equal(profiles.account('account-a')!.cleanup, 1);
  sync.disable(); cleanup.resolve(false); await flight;
  assert.equal(profiles.account('account-a')!.cleanup, 1); assert.equal(sync.getSnapshot().enabled, false);
});

test('local edits during cleanup are included in publication', async t => {
  const { sync, profiles, heads, cloud, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  heads.set('account-a', { ...heads.get('account-a')!, cleanupPending: true });
  profiles.current().saveValue('settings', '{"mode":"manual","rate":2}');
  const cleanup = deferred<boolean>(); cloud.cleanup = () => cleanup.promise;
  const flight = sync.retry(); await drain();
  profiles.current().saveValue('settings', '{"mode":"manual","rate":3}'); cleanup.resolve(false); await flight;
  assert.equal(JSON.parse(published.at(-1)!).tables.preferences.find((row: { key: string }) => row.key === 'settings').value,
    '{"mode":"manual","rate":3}');
  assert.equal(profiles.current().pending(), false);
});

test('manual first-use refresh with consent stays off and never schedules automatic work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const { sync, profiles, published } = fixture(t);
  profiles.store('guest').journal.save('sample-v1', session());
  await sync.refreshAccount(false); await sync.refresh(true);
  assert.notEqual(profiles.id(), 'guest'); assert.equal(sync.getSnapshot().enabled, false);
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1)?.runId, session().runId);
  t.mock.timers.tick(180_000); await drain(); assert.equal(published.length, 1);
});

test('reenabling an existing backup does not ask to import guest records again', async t => {
  const { sync, profiles } = fixture(t);
  await sync.refreshAccount(false); await sync.enable(false); sync.disable();
  const id = profiles.id();
  await enableAutomaticBackup(sync, async () => { assert.fail('existing profile must not prompt for guest import'); });
  assert.equal(profiles.id(), id);
  assert.equal(sync.getSnapshot().enabled, true);
});

test('pending progress retries cleanup before publishing when the native backlog is full', async t => {
  const { sync, profiles, cloud, heads, published } = fixture(t);
  await sync.refreshAccount(false); await sync.enable(false);
  heads.set('account-a', { ...heads.get('account-a')!, cleanupPending: true });
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  let full = true, deletionsUnavailable = true;
  cloud.cleanup = async () => {
    if (!deletionsUnavailable) full = false;
    return full;
  };
  const publish = cloud.publish;
  cloud.publish = async (...args) => {
    if (full) throw Error('progress-cloud-tooLarge');
    return publish(...args);
  };
  await sync.retry();
  assert.equal(profiles.current().pending(), true);
  assert.equal(published.length, 1);
  deletionsUnavailable = false;
  await sync.retry();
  assert.equal(sync.getSnapshot().error, null);
  assert.equal(profiles.current().pending(), false);
  assert.equal(published.length, 2);
  assert.equal(profiles.readValue('settings'), '{"mode":"manual","rate":2}');
});

test('local edits during an unchanged cloud lookup publish the latest revision without conflict', async t => {
  const { sync, profiles, cloud, heads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const list = cloud.list, delayed = deferred<CloudBackup[]>();
  cloud.list = () => delayed.promise;
  const retry = sync.retry(); await drain();
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  sync.changed();
  cloud.list = list; delayed.resolve([heads.get('account-a')!]); await retry;
  assert.equal(sync.getSnapshot().conflict, null);
  assert.equal(sync.getSnapshot().error, null);
  assert.equal(profiles.current().pending(), false);
  assert.equal(published.length, 2);
  assert.equal(JSON.parse(published[1]!).tables.preferences[0].value, '{"mode":"manual","rate":2}');
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

test('account notification hides private state before identity and calls every pause guard despite storage failure', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.current(); original.saveValue('settings', '{"mode":"manual","rate":2}');
  const identity = deferred<{ status: 'available'; scope: string }>(); cloud.account = () => identity.promise;
  let stopped = false;
  sync.beforeSwitch(() => { throw Error('disk'); }); sync.beforeSwitch(() => { stopped = true; });
  const change = sync.accountChanged();
  assert.equal(stopped, true); assert.equal(profiles.id(), 'guest');
  assert.equal(sync.getSnapshot().learningAvailable, false);
  assert.equal(sync.getSnapshot().error, 'progress-cloud-storage');
  identity.resolve({ status: 'available', scope: 'account-b' }); await change;
  assert.equal(original.readValue('settings'), '{"mode":"manual","rate":2}');
});

test('local removal clears real records, revisions and guest fallback and revokes an old player writer', async t => {
  const { sync, profiles } = fixture(t);
  profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  const original = profiles.current(), write = original.journal.createWriter('sample-v1', session());
  original.journal.save('sample-v1', session());
  const other = profiles.store('other'); other.journal.save('sample-v1', session());
  await sync.removeLocal();
  assert.equal(profiles.readValue('settings'), null);
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1), null);
  assert.equal(profiles.current().revision(), 0);
  assert.throws(() => write({ ...session(), audioSeconds: 1 }), /revoked/);
  assert.throws(() => original.saveValue('settings', '{"mode":"manual","rate":3}'), /revoked/);
  assert.equal(other.journal.load('sample-v1', 1, 1)?.runId, 'finished');
  assert.equal(sync.getSnapshot().deletion, null);
});

const resetID = '11111111-1111-4111-8111-111111111111';
test('verified remote reset discards stale local learning and settings before any merge or publication', async t => {
  const { sync, profiles, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session());
  const old = profiles.current(), authority = sync.getSnapshot().authority;
  heads.set('account-a', { ...publication(0, 'reset'), resetGeneration: resetID });
  payloads.set('reset', encodeEnvelope(emptyProgress(), resetID));
  await sync.retry();
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1), null);
  assert.equal(profiles.current().resetGeneration(), resetID);
  assert.equal(profiles.current().revision(), 0);
  assert.equal(published.length, 1);
  assert.notEqual(sync.getSnapshot().authority, authority);
  assert.throws(() => old.saveValue('settings', '{"mode":"manual","rate":3}'), /revoked/);
});

test('offline cloud deletion persists one request and resumes with automatic sync off after restart', async t => {
  const { sync, profiles, cloud, open, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session());
  const reset = cloud.reset; cloud.reset = async () => { throw Error('progress-cloud-offline'); };
  await sync.deleteCloud();
  const intent = profiles.deletions.cloud('account-a')!;
  assert.ok(intent.request); assert.equal(intent.expected, '');
  assert.equal(sync.getSnapshot().learningAvailable, false);
  assert.equal(sync.getSnapshot().enabled, false);
  await sync.deleteCloud(); assert.equal(profiles.deletions.cloud('account-a')!.request, intent.request);
  sync.dispose(); cloud.reset = reset;
  const reopened = new ProgressProfiles(open, () => 'unused'), next = new ProgressSync(reopened, cloud); t.after(() => next.dispose());
  await next.refreshAccount();
  assert.equal(next.getSnapshot().deletion, null); assert.equal(next.getSnapshot().enabled, false);
  assert.equal(reopened.current().journal.load('sample-v1', 1, 1), null);
  assert.equal(heads.get('account-a')?.resetGeneration, intent.request);
  assert.equal(JSON.parse(payloads.get(heads.get('account-a')!.id)!).progress.tables.checkpoints.length, 0);
  assert.equal(published.length, 1);
});

test('local SQLite failure rolls back and survives relaunch; native discard failure keeps learning blocked until retry', async t => {
  const { sync, profiles, cloud, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const profile = profiles.id(); profiles.current().journal.save('sample-v1', session());
  const before = profiles.current().exportBackup(), revision = profiles.current().revision();
  open(profile).exec("CREATE TRIGGER deny_wipe BEFORE DELETE ON checkpoints BEGIN SELECT RAISE(ABORT, 'disk'); END");
  await sync.removeLocal();
  assert.equal(profiles.current().exportBackup(), before); assert.equal(profiles.current().revision(), revision);
  assert.equal(sync.getSnapshot().deletion?.kind, 'local'); assert.equal(sync.getSnapshot().learningAvailable, false);
  sync.dispose(); open(profile).exec('DROP TRIGGER deny_wipe');
  cloud.discardLocal = async () => { throw Error('progress-cloud-storage'); };
  const reopened = new ProgressProfiles(open, () => 'unused'), next = new ProgressSync(reopened, cloud); t.after(() => next.dispose());
  await next.refreshAccount();
  assert.equal(reopened.current().hasData(), false); assert.equal(next.getSnapshot().deletion?.kind, 'local');
  cloud.discardLocal = async () => {}; await next.retryDeletion();
  assert.equal(next.getSnapshot().deletion, null); assert.equal(next.getSnapshot().learningAvailable, true);
});

test('startup cached account stays hidden until verification and unchanged refresh preserves session authority', async t => {
  const { sync, profiles, cloud, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const id = profiles.id(); profiles.saveValue('settings', '{"mode":"manual","rate":2}'); sync.dispose();
  const next = new ProgressSync(new ProgressProfiles(open, () => 'unused'), cloud); t.after(() => next.dispose());
  assert.equal(next.getSnapshot().profile, 'guest'); assert.equal(next.getSnapshot().learningAvailable, false);
  await next.refreshAccount(); assert.equal(next.getSnapshot().profile, id);
  const authority = next.getSnapshot().authority;
  await next.refreshAccount(); assert.equal(next.getSnapshot().authority, authority);
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await next.accountChanged();
  cloud.account = async () => ({ status: 'available', scope: 'account-a' }); await next.accountChanged();
  assert.equal(next.profiles.readValue('settings'), '{"mode":"manual","rate":2}');
  assert.equal(next.authorized(authority, id), false);
});

test('cloud reset lost response adopts later new-generation learning and keeps original request through cleanup', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session());
  const reset = cloud.reset;
  cloud.reset = async (...args) => { await reset(...args); throw Error('progress-cloud-offline'); };
  await sync.deleteCloud();
  const intent = profiles.deletions.cloud('account-a')!;
  const source = profiles.store('fresh'); source.journal.save('sample-v1', { ...session(), runId: 'new-learning', confirmed: 3, phase: 'complete' });
  const fresh = { ...publication(7, 'fresh'), resetGeneration: intent.request, cleanupPending: true };
  heads.set('account-a', fresh); payloads.set('fresh', encodeEnvelope(source.exportBackup(), intent.request));
  cloud.reset = reset; await sync.retryDeletion();
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 1);
  assert.equal(profiles.current().resetGeneration(), intent.request);
  assert.equal(sync.getSnapshot().deletion?.kind, 'cloud'); assert.equal(sync.getSnapshot().learningAvailable, false);
  assert.equal(profiles.deletions.cloud('account-a')!.request, intent.request);
  heads.set('account-a', { ...fresh, cleanupPending: false }); await sync.retryDeletion();
  assert.equal(profiles.current().journal.completions('sample-v1', 1), 1);
  assert.equal(sync.getSnapshot().deletion, null); assert.equal(sync.getSnapshot().learningAvailable, true);
});

test('concurrent reset adopts its generation and a reset head/read race never imports discarded payload', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const reset = cloud.reset;
  cloud.reset = async (...args) => {
    heads.set('account-a', { ...publication(0, 'winner'), resetGeneration: resetID });
    payloads.set('winner', encodeEnvelope(emptyProgress(), resetID));
    return reset(...args);
  };
  await sync.deleteCloud();
  assert.equal(profiles.current().resetGeneration(), resetID); assert.equal(sync.getSnapshot().deletion, null);
  const source = profiles.store('source'); source.journal.save('sample-v1', session());
  const nextID = '22222222-2222-4222-8222-222222222222';
  heads.set('account-a', { ...publication(1, 'stale'), resetGeneration: nextID });
  payloads.set('stale', encodeEnvelope(source.exportBackup(), nextID));
  const read = cloud.read;
  cloud.read = async (...args) => {
    const json = await read(...args);
    if (args[1] === 'stale') {
      heads.set('account-a', { ...publication(2, 'latest'), resetGeneration: nextID });
      payloads.set('latest', encodeEnvelope(emptyProgress(), nextID));
    }
    return json;
  };
  await sync.refresh();
  assert.equal(profiles.current().hasData(), false); assert.equal(profiles.current().resetGeneration(), nextID);
});

test('known reset generation refuses absent head and legacy rollback without publishing', async t => {
  const { sync, profiles, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false); await sync.deleteCloud();
  const marker = profiles.current().resetGeneration();
  heads.delete('account-a'); await sync.refresh();
  assert.equal(sync.getSnapshot().error, 'progress-cloud-corrupt'); assert.equal(published.length, 1);
  heads.set('account-a', publication(1, 'legacy')); payloads.set('legacy', emptyProgress());
  await sync.refresh();
  assert.equal(sync.getSnapshot().error, 'progress-cloud-corrupt'); assert.equal(published.length, 1);
  assert.equal(profiles.current().resetGeneration(), marker);
});

test('pending account deletion survives account switch and cannot be cancelled by guest local removal', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const original = profiles.id(), reset = cloud.reset, waiting = deferred<CloudPublication>();
  cloud.reset = () => waiting.promise;
  const deletion = sync.deleteCloud(); await drain();
  const intent = profiles.deletions.cloud('account-a')!;
  cloud.account = async () => ({ status: 'no-account' }); await sync.accountChanged();
  await sync.removeLocal();
  waiting.resolve({ ...publication(0), resetGeneration: intent.request }); await deletion;
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.deletions.cloud('account-a')!.request, intent.request);
  cloud.reset = reset; cloud.account = async () => ({ status: 'available', scope: 'account-a' }); await sync.accountChanged();
  assert.equal(profiles.id(), original); assert.equal(sync.getSnapshot().deletion, null);
});

test('offline identity refresh preserves local deletion authority and network return retries deletion while automatic sync is off', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false); sync.disable();
  cloud.account = async () => ({ status: 'unknown' }); await sync.refreshAccount();
  const reset = cloud.reset; cloud.reset = async () => { throw Error('progress-cloud-offline'); };
  await sync.deleteCloud();
  assert.ok(profiles.deletions.cloud('account-a'));
  cloud.reset = reset; sync.networkAvailable(); await drain();
  assert.equal(sync.getSnapshot().deletion, null); assert.equal(sync.getSnapshot().enabled, false);
  assert.equal(profiles.current().hasData(), false);
});

test('captured settings callback never regains authority after A to B to A or same-profile deletion', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const id = profiles.id(), authority = sync.getSnapshot().authority;
  const edit = () => sync.savePreference('settings', '{"mode":"manual","rate":3}', authority, id);
  assert.equal(edit(), true);
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.accountChanged();
  cloud.account = async () => ({ status: 'available', scope: 'account-a' }); await sync.accountChanged();
  assert.equal(edit(), false);
  const current = sync.getSnapshot().authority;
  await sync.removeLocal();
  assert.equal(sync.savePreference('settings', '{"mode":"manual","rate":2}', current, id), false);
  assert.equal(profiles.current().hasData(), false);
});

test('confirmation from before a remote reset cannot delete fresh same-profile learning', async t => {
  const { sync, profiles, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const confirmation = sync.getSnapshot().generation;
  heads.set('account-a', { ...publication(0, 'reset'), resetGeneration: resetID });
  payloads.set('reset', encodeEnvelope(emptyProgress(), resetID)); await sync.retry();
  profiles.current().journal.save('sample-v1', { ...session(), runId: 'fresh' });
  await sync.removeLocal(confirmation);
  assert.equal(profiles.current().journal.load('sample-v1', 1, 1)?.runId, 'fresh');
});

test('local removal fences an already downloading backup before its late payload can repopulate rows', async t => {
  const { sync, profiles, cloud, heads, payloads } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session());
  const read = deferred<string>(); cloud.read = () => read.promise;
  const work = sync.retry(); await drain();
  await sync.removeLocal();
  read.resolve(payloads.get(heads.get('account-a')!.id)!); await work;
  assert.equal(profiles.current().hasData(), false); assert.equal(profiles.current().revision(), 0);
  assert.equal(sync.getSnapshot().enabled, false);
});

test('native identity invalidation during a routine pass hides private learning without waiting for another notification', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session()); const id = profiles.id();
  cloud.list = async () => { throw Error('progress-cloud-accountChanged'); };
  await sync.retry();
  assert.equal(profiles.id(), 'guest'); assert.equal(sync.getSnapshot().learningAvailable, false);
  assert.equal(profiles.store(id).journal.load('sample-v1', 1, 1)?.runId, 'finished');
});

test('cloud reset transaction failure preserves all old records and the boundary marker until safe retry', async t => {
  const { sync, profiles, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session());
  const db = open(profiles.id()), before = profiles.current().exportBackup(), revision = profiles.current().revision();
  db.exec("CREATE TRIGGER deny_reset BEFORE UPDATE ON progress_reset BEGIN SELECT RAISE(ABORT, 'disk'); END");
  await sync.deleteCloud();
  assert.equal(profiles.current().exportBackup(), before); assert.equal(profiles.current().revision(), revision);
  assert.equal(profiles.current().resetGeneration(), ''); assert.equal(sync.getSnapshot().learningAvailable, false);
  db.exec('DROP TRIGGER deny_reset'); await sync.retryDeletion();
  assert.equal(profiles.current().hasData(), false); assert.equal(sync.getSnapshot().deletion, null);
});

test('reset envelope rejects malformed and future payloads without any local mutation', async t => {
  const { sync, profiles, heads, payloads, published } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  profiles.current().journal.save('sample-v1', session()); const before = profiles.current().exportBackup();
  heads.set('account-a', { ...publication(0, 'bad'), resetGeneration: resetID });
  for (const json of [JSON.stringify({ version: 6, generation: resetID, progress: JSON.parse(emptyProgress()) }),
    JSON.stringify({ version: 5, generation: resetID, progress: { version: 4, tables: {}, sync: {} } }),
    encodeEnvelope(emptyProgress(), '22222222-2222-4222-8222-222222222222')]) {
    payloads.set('bad', json); await sync.retry();
    assert.equal(profiles.current().exportBackup(), before); assert.equal(profiles.current().resetGeneration(), '');
    assert.equal(published.length, 1);
    assert.ok(['progress-cloud-corrupt', 'progress-cloud-updateRequired'].includes(sync.getSnapshot().error!));
  }
});

test('reset-generation learning stays compressed and canonical across clean polls and a second installation', async t => {
  const a = fixture(t), b = fixture(t); b.sync.dispose();
  const second = new ProgressSync(b.profiles, a.cloud); t.after(() => second.dispose());
  await a.sync.refreshAccount(); await a.sync.enable(false); await a.sync.deleteCloud();
  const initial = createSession({ runId: 'long-reset-run', stage: 1, phraseCount: 200, mode: 'manual', rate: 1 });
  const save = a.profiles.current().journal.createWriter('sample-v1', initial, { language: 'english', book: 'sample' });
  const player = new Player(initial, { prepare: async () => {}, play() {}, pause() {}, position: () => 0, dispose() {} }, save, () => 0, () => {});
  await player.resume(); player.audioEnded(1); await player.confirm(); player.dispose();
  await a.sync.refresh();
  assert.equal(typeof JSON.parse(a.published.at(-1)!).progress.sync.runs[0].observed, 'string');
  await second.refreshAccount(); await second.enable(false);
  const count = a.published.length;
  await second.retry(); await a.sync.refresh();
  assert.equal(a.published.length, count);
  assert.equal(b.profiles.current().journal.progress.summary('english').xp, 1);
  assert.equal(b.profiles.current().exportBackup(), a.profiles.current().exportBackup());
});

test('guest local removal never retires an unselected account cache', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount();
  cloud.discardLocal = async () => { throw Error('wrong account cache'); };
  profiles.current().journal.save('sample-v1', session());
  await sync.removeLocal();
  assert.equal(sync.getSnapshot().deletion, null); assert.equal(sync.getSnapshot().error, null);
  assert.equal(profiles.current().hasData(), false);
});

test('late failed deletion for A cannot change B status or hide its newly verified learning', async t => {
  const { sync, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  let reject!: (error: Error) => void;
  cloud.reset = () => new Promise((_, fail) => { reject = fail; });
  const deletion = sync.deleteCloud(); await drain();
  cloud.account = async () => ({ status: 'available', scope: 'account-b' }); await sync.accountChanged(); await sync.enable(false);
  reject(Error('progress-cloud-accountChanged')); await deletion;
  assert.equal(sync.getSnapshot().hasProfile, true); assert.equal(sync.getSnapshot().learningAvailable, true);
  assert.equal(sync.getSnapshot().error, null);
});

test('pending deletion stays visible through unknown identity refresh and retries independently of sync', async t => {
  const { sync, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const reset = cloud.reset; cloud.reset = async () => { throw Error('progress-cloud-offline'); };
  await sync.deleteCloud();
  cloud.account = async () => ({ status: 'unknown' }); await sync.refreshAccount();
  assert.equal(sync.getSnapshot().deletion?.kind, 'cloud'); assert.equal(sync.getSnapshot().learningAvailable, false);
  cloud.reset = reset; await sync.retryDeletion();
  assert.equal(sync.getSnapshot().deletion, null); assert.equal(sync.getSnapshot().enabled, false);
});

for (const publishFirst of [true, false]) test(`two real SQLite installations discard stale learning when reset ${publishFirst ? 'follows' : 'precedes'} reconnect`, async t => {
  const a = fixture(t), b = fixture(t); b.sync.dispose();
  const second = new ProgressSync(b.profiles, a.cloud); t.after(() => second.dispose());
  await a.sync.refreshAccount(); await a.sync.enable(false); await second.refreshAccount(); await second.enable(false);
  b.profiles.current().journal.save('sample-v1', { ...session(), runId: 'old-offline-run', confirmed: 3, phase: 'complete' });
  if (publishFirst) await second.retry();
  await a.sync.deleteCloud(); await second.retry();
  assert.equal(a.profiles.current().hasData(), false); assert.equal(b.profiles.current().hasData(), false);
  assert.equal(a.profiles.current().resetGeneration(), b.profiles.current().resetGeneration());
  const head = a.heads.get('account-a')!;
  assert.equal(JSON.parse(a.payloads.get(head.id)!).progress.tables.completions.length, 0);
});

test('restricted native identity hides the outgoing account while ordinary offline identity keeps verified local learning', async t => {
  const { sync, profiles, cloud } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const id = profiles.id(); profiles.current().journal.save('sample-v1', session());
  cloud.account = async () => ({ status: 'unknown' }); await sync.refreshAccount();
  assert.equal(sync.getSnapshot().learningAvailable, true); assert.equal(profiles.id(), id);
  cloud.account = async () => ({ status: 'unavailable' }); await sync.refreshAccount();
  assert.equal(profiles.id(), 'guest'); assert.equal(profiles.store(id).journal.load('sample-v1', 1, 1)?.runId, 'finished');
});

test('account notification hides private UI even when the registry cannot persist guest selection', async t => {
  const { sync, profiles, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const old = profiles.current(); old.journal.save('sample-v1', session());
  open('progress-profiles-v1').exec("CREATE TRIGGER deny_selection BEFORE UPDATE ON active_profile BEGIN SELECT RAISE(ABORT, 'disk'); END");
  await sync.accountChanged();
  assert.equal(sync.getSnapshot().profile, 'guest'); assert.equal(sync.getSnapshot().learningAvailable, false);
  assert.equal(sync.getSnapshot().error, 'progress-cloud-storage');
  assert.equal(old.journal.load('sample-v1', 1, 1)?.runId, 'finished');
});

for (const target of ['account-b', 'no-account'] as const) test(`foreground identity refresh fails closed when selecting ${target} cannot commit`, async t => {
  const { sync, profiles, cloud, open } = fixture(t);
  await sync.refreshAccount(); await sync.enable(false);
  const a = profiles.id(); profiles.saveValue('settings', '{"mode":"manual","rate":2}');
  cloud.account = async () => ({ status: 'available', scope: 'account-b' });
  await sync.refreshAccount(); await sync.enable(false);
  const b = profiles.id(); profiles.saveValue('settings', '{"mode":"manual","rate":3}');
  cloud.account = async () => ({ status: 'available', scope: 'account-a' });
  await sync.refreshAccount(false);
  const beforeA = profiles.store(a).exportBackup(), beforeB = profiles.store(b).exportBackup();
  const oldAuthority = sync.getSnapshot().authority;
  // Both destinations are controlled fixture IDs. Blocking all selection also
  // proves that the privacy fallback works without a successful guest write.
  open('progress-profiles-v1').exec("CREATE TRIGGER deny_refresh_selection BEFORE UPDATE ON active_profile BEGIN SELECT RAISE(ABORT, 'disk'); END");
  cloud.account = async () => target === 'no-account' ? { status: 'no-account' } : { status: 'available', scope: target };
  await sync.refreshAccount(false);
  const state = sync.getSnapshot();
  assert.equal(state.profile, 'guest'); assert.equal(profiles.id(), 'guest');
  assert.equal(state.learningAvailable, false); assert.equal(state.error, 'progress-cloud-storage');
  assert.equal(state.ready, false); assert.equal(state.hasProfile, false); assert.equal(state.enabled, false); assert.equal(state.busy, false);
  assert.deepEqual(state.backups, []);
  assert.equal(sync.authorized(oldAuthority, a), false);
  assert.equal(sync.authorized(state.authority, a), false);
  assert.equal(sync.authorized(state.authority, 'guest'), false);
  assert.equal(sync.savePreference('settings', '{"mode":"manual","rate":1}', state.authority, a), false);
  await sync.deleteCloud();
  assert.equal(profiles.deletions.cloud('account-a'), undefined);
  assert.equal(profiles.deletions.cloud('account-b'), undefined);
  assert.equal(profiles.store(a).exportBackup(), beforeA);
  assert.equal(profiles.store(b).exportBackup(), beforeB);
  open('progress-profiles-v1').exec('DROP TRIGGER deny_refresh_selection');
  cloud.account = async () => ({ status: 'available', scope: 'account-a' });
  await sync.refreshAccount(false);
  assert.equal(sync.getSnapshot().profile, a); assert.equal(sync.getSnapshot().learningAvailable, true);
  assert.equal(profiles.current().exportBackup(), beforeA);
});
