import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncSnapshot } from './progress-sync';
import { buildICloudSyncUI } from './icloud-backup-ui';

const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  profile: 'guest', generation: 7, status: 'available', hasProfile: false,
  enabled: false, ready: true, busy: false, pending: false, error: null,
  backups: [], cleanupPending: false, conflict: null, ...patch,
});

test('offline and contention are quiet while actionable errors remain sanitized', () => {
  for (const error of ['progress-cloud-offline', 'progress-cloud-busy', 'progress-cloud-conflict']) {
    assert.equal(buildICloudSyncUI(snapshot({ error })).error, null);
  }
  assert.match(buildICloudSyncUI(snapshot({ error: 'progress-cloud-quota' })).error!, /저장 공간/);
  assert.match(buildICloudSyncUI(snapshot({ error: 'progress-cloud-updateRequired' })).error!, /업데이트/);
  assert.doesNotMatch(buildICloudSyncUI(snapshot({ error: 'private-account-secret' })).error!, /private-account-secret/);
});

test('an in-flight sync disables repeat refresh without hiding pending work', () => {
  const ui = buildICloudSyncUI(snapshot({ busy: true, pending: true }));
  assert.equal(ui.refreshDisabled, true);
  assert.equal(ui.pending, true);
});

test('automatic sync offers refresh without choosing or overwriting a device record', () => {
  const ui = buildICloudSyncUI(snapshot({ enabled: true, hasProfile: true }));
  assert.equal(ui.title, '자동 동기화');
  assert.equal(ui.refreshLabel, '지금 동기화');
  assert.equal(ui.refreshDisabled, false);
  assert.equal(ui.error, null);
});
