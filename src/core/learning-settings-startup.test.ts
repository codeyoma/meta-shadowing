import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { nativeModules } from '../test-support/native-render';

function fixture(t: TestContext, failure: 'malformed' | 'kv-read' | 'sqlite' | 'kv-write') {
  const databases = new Map<string, DatabaseSync>();
  let failing = true;
  const alerts: string[][] = [];
  const legacy = new Map<string, string>();
  if (failure === 'malformed') legacy.set('practice-settings-v1', 'malformed-private-fixture');
  const load = nativeModules({
    'react-native': { Alert: { alert: (...text: string[]) => alerts.push(text) },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-sqlite': { openDatabaseSync(id: string) {
      const db = databases.get(id) ?? new DatabaseSync(':memory:'); databases.set(id, db);
      return { execSync: (sql: string) => db.exec(sql),
        runSync(sql: string, ...args: (string | number)[]) {
          if (failing && failure === 'sqlite' && sql.startsWith('INSERT INTO preferences')) throw Error('private disk failure');
          db.prepare(sql).run(...args);
        },
        getFirstSync: (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args),
        getAllSync: (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) };
    } },
    'expo-sqlite/kv-store': { getItemSync(key: string) {
      if (failing && failure === 'kv-read') throw Error('private KV failure');
      return legacy.get(key) ?? null;
    }, setItemSync(key: string, value: string) {
      if (failing && failure === 'kv-write') throw Error('private KV failure');
      legacy.set(key, value);
    }, removeItemSync: (key: string) => legacy.delete(key) },
    'expo-crypto': { randomUUID: () => 'startup-fixture' },
    '../../modules/progress-cloud': { stop: async () => {}, account: async () => ({ status: 'no-account' }),
      addListener: () => ({ remove() {} }) },
    '@/native/catalog': { books: [] },
  });
  const native = load('native/progress-sync.ts') as typeof import('../native/progress-sync');
  t.after(async () => {
    native.getProgressSync().dispose();
    await new Promise(resolve => setImmediate(resolve));
    databases.forEach(db => db.close());
  });
  return { native, alerts, legacy, recover: () => { failing = false; legacy.clear(); } };
}

for (const failure of ['malformed', 'kv-read', 'sqlite'] as const) {
  test(`preference initialization ${failure} failure does not prevent root startup and reports a safe recovery action`, async t => {
    const f = fixture(t, failure);
    assert.doesNotThrow(() => f.native.getProgressSync());
    const coordinator = f.native.getProgressSync();
    assert.equal(coordinator.getSnapshot().learningAvailable, true);
    assert.deepEqual(f.alerts, [], 'Rendering the root must not present an alert');
    const stop = f.native.startProgressSync();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.alerts.length, 1);
    assert.match(f.alerts[0]![1]!, /다시/);
    assert.doesNotMatch(JSON.stringify(f.alerts), /private|malformed-private-fixture/);
    assert.equal(coordinator.getSnapshot().pending, false);
    assert.equal(coordinator.profiles.current().readValue('settings'), null, 'Failed initialization is atomic');
    if (failure === 'malformed') assert.equal(f.legacy.get('practice-settings-v1'), 'malformed-private-fixture');
    f.recover(); stop();
    const restarted = f.native.getProgressSync();
    assert.deepEqual(JSON.parse(restarted.profiles.readValue('settings')!), {
      mode: 'manual', rate: 1, originalTextSize: 20, translationTextSize: 18,
    });
    await restarted.refreshAccount();
    assert.equal(restarted.getSnapshot().pending, false);
  });
}

test('initial defaults do not depend on a legacy KV write or create pending work', async t => {
  const f = fixture(t, 'kv-write');
  assert.doesNotThrow(() => f.native.getProgressSync());
  const sync = f.native.getProgressSync();
  await sync.refreshAccount();
  assert.equal(sync.getSnapshot().pending, false);
  assert.deepEqual(JSON.parse(sync.profiles.readValue('settings')!), {
    mode: 'manual', rate: 1, originalTextSize: 20, translationTextSize: 18,
  });
  assert.equal(f.legacy.size, 0);
  assert.deepEqual(f.alerts, []);
});
