import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncSnapshot } from './progress-sync';
import {
  buildProgressDeletionUI,
  confirmProgressDeletion,
  retryProgressDeletion,
  type ProgressDeletionPort,
} from './progress-deletion-ui';

const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  profile: 'guest', generation: 7, status: 'no-account', hasProfile: false,
  enabled: false, ready: true, busy: false, pending: false, error: null,
  authority: 3, learningAvailable: true, deletion: null,
  backups: [], cleanupPending: false, conflict: null, ...patch,
});

function port(initial = snapshot()) {
  let state = initial;
  const calls: Array<{ action: 'local' | 'cloud' | 'retry'; generation?: number }> = [];
  const value: ProgressDeletionPort & {
    calls: typeof calls;
    set(next: SyncSnapshot): void;
    onLocal?: (generation?: number) => void | Promise<void>;
    onCloud?: (generation?: number) => void | Promise<void>;
    onRetry?: () => void | Promise<void>;
  } = {
    calls,
    getSnapshot: () => state,
    set: next => { state = next; },
    async removeLocal(generation) { calls.push({ action: 'local', generation }); await value.onLocal?.(generation); },
    async deleteCloud(generation) { calls.push({ action: 'cloud', generation }); await value.onCloud?.(generation); },
    async retryDeletion() { calls.push({ action: 'retry' }); await value.onRetry?.(); },
  };
  return value;
}

test('cancelling a destructive confirmation performs no action', async () => {
  const coordinator = port();
  const result = await confirmProgressDeletion(coordinator, 'local', async () => false);

  assert.equal(result, 'cancelled');
  assert.deepEqual(coordinator.calls, []);
});

test('profile or generation changes invalidate consent captured by an open dialog', async () => {
  for (const changed of [
    snapshot({ profile: 'replacement-profile', generation: 7, status: 'available', hasProfile: true }),
    snapshot({ profile: 'guest', generation: 8 }),
  ]) {
    const coordinator = port();
    const result = await confirmProgressDeletion(coordinator, 'local', async () => {
      coordinator.set(changed);
      return true;
    });

    assert.equal(result, 'stale');
    assert.deepEqual(coordinator.calls, []);
  }
});

test('a guest can remove local records but cannot request account cloud deletion', async () => {
  const coordinator = port();
  coordinator.onLocal = generation => coordinator.set(snapshot({ generation: generation! + 1 }));

  assert.equal(buildProgressDeletionUI(coordinator.getSnapshot()).localDisabled, false);
  assert.equal(buildProgressDeletionUI(coordinator.getSnapshot()).cloudAvailable, false);
  assert.equal(await confirmProgressDeletion(coordinator, 'cloud', async () => true), 'blocked');
  assert.equal(await confirmProgressDeletion(coordinator, 'local', async () => true), 'completed');
  assert.deepEqual(coordinator.calls, [{ action: 'local', generation: 7 }]);
});

test('a retained verified account can queue cloud deletion during an ordinary offline identity refresh', async () => {
  const offlineAccount = snapshot({
    profile: 'account-profile',
    status: 'unknown',
    hasProfile: false,
    ready: false,
    learningAvailable: true,
  });
  const coordinator = port(offlineAccount);
  coordinator.onCloud = generation => coordinator.set(snapshot({
    ...offlineAccount,
    generation: generation! + 1,
    learningAvailable: false,
    deletion: { kind: 'cloud', pending: true },
    error: 'progress-cloud-offline',
  }));

  assert.equal(buildProgressDeletionUI(coordinator.getSnapshot()).cloudAvailable, true);
  assert.equal(await confirmProgressDeletion(coordinator, 'cloud', async () => true), 'pending');
  assert.deepEqual(coordinator.calls, [{ action: 'cloud', generation: 7 }]);
});

test('startup or account-change unknown guest state cannot target a remembered cloud identity', async () => {
  const coordinator = port(snapshot({ status: 'unknown', ready: false, learningAvailable: false }));

  assert.equal(buildProgressDeletionUI(coordinator.getSnapshot()).cloudAvailable, false);
  assert.equal(await confirmProgressDeletion(coordinator, 'cloud', async () => true), 'blocked');
  assert.deepEqual(coordinator.calls, []);
});

test('busy or pending destructive work cannot overlap another request', async () => {
  for (const state of [
    snapshot({ busy: true }),
    snapshot({ deletion: { kind: 'local', pending: true }, learningAvailable: false }),
    snapshot({ deletion: { kind: 'cloud', pending: true }, learningAvailable: false }),
  ]) {
    const coordinator = port(state);
    assert.equal(await confirmProgressDeletion(coordinator, 'local', async () => true), 'blocked');
    assert.equal(await confirmProgressDeletion(coordinator, 'cloud', async () => true), 'blocked');
    assert.deepEqual(coordinator.calls, []);
  }
});

test('an account remains identified as cloud-capable while local deletion is pending', () => {
  const state = snapshot({
    profile: 'account-profile',
    status: 'available',
    hasProfile: true,
    learningAvailable: false,
    deletion: { kind: 'local', pending: true },
  });

  assert.equal(buildProgressDeletionUI(state).cloudAvailable, true);
  assert.equal(buildProgressDeletionUI(state).cloudDisabled, true);
});

test('offline cloud deletion stays pending with retry enabled while automatic sync is off', async () => {
  const account = snapshot({
    profile: 'account-profile', status: 'available', hasProfile: true, enabled: false,
  });
  const coordinator = port(account);
  coordinator.onCloud = generation => coordinator.set(snapshot({
    ...account,
    generation: generation! + 1,
    enabled: false,
    learningAvailable: false,
    deletion: { kind: 'cloud', pending: true },
    error: 'progress-cloud-offline',
  }));

  assert.equal(await confirmProgressDeletion(coordinator, 'cloud', async () => true), 'pending');
  const ui = buildProgressDeletionUI(coordinator.getSnapshot());
  assert.equal(ui.retryVisible, true);
  assert.equal(ui.retryDisabled, false);
  assert.equal(ui.controlsDisabled, true);
});

test('cloud deletion completes only after cleanup is acknowledged', async () => {
  const pending = snapshot({
    profile: 'account-profile', generation: 8, status: 'available', hasProfile: true,
    enabled: false, learningAvailable: false, deletion: { kind: 'cloud', pending: true },
  });
  const coordinator = port(pending);
  let retries = 0;
  coordinator.onRetry = () => {
    retries += 1;
    if (retries === 1) coordinator.set(snapshot({ ...pending, cleanupPending: true }));
    else coordinator.set(snapshot({ ...pending, deletion: null, cleanupPending: false, learningAvailable: true, error: null }));
  };

  assert.equal(await retryProgressDeletion(coordinator), 'pending');
  assert.equal(buildProgressDeletionUI(coordinator.getSnapshot()).retryVisible, true);
  assert.equal(await retryProgressDeletion(coordinator), 'completed');
  assert.equal(buildProgressDeletionUI(coordinator.getSnapshot()).retryVisible, false);
  assert.deepEqual(coordinator.calls, [{ action: 'retry' }, { action: 'retry' }]);
});
