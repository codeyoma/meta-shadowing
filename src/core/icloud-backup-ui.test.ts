import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncSnapshot } from './progress-sync';
import { buildICloudBackupUI } from './icloud-backup-ui';

const backup = (id: string, legacy = false, createdAt = '2026-09-13T04:05:00.000Z') => ({
  id, createdAt, revision: 41, token: 'opaque-head', legacy,
});
const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  profile: 'guest', generation: 7, status: 'available', hasProfile: false,
  enabled: false, ready: true, busy: false, pending: false, error: null,
  backups: [], cleanupPending: false,
  conflict: { token: '7:choice:1', profile: 'guest', localRevision: 3, generation: 7, backups: [backup('7:0')] },
  ...patch,
});
const format = () => '2026. 9. 13. 오후 1:05';
const enabling = { enable: true, allowLocal: true };
const downloading = { enable: false, allowLocal: false };

test('single-candidate replacement confirmation includes the saved date and time', () => {
  const ui = buildICloudBackupUI(snapshot(), format, enabling);
  const cloud = ui.actions.find(action => action.resolution.choice === 'cloud')!;
  assert.match(cloud.title, /2026\. 9\. 13\. 오후 1:05/);
  assert.match(cloud.confirmation.message, /2026\. 9\. 13\. 오후 1:05/);
  assert.equal(ui.actions.filter(action => action.resolution.choice === 'cloud').length, 1);
});

test('direct Download confirmation shows the timestamp while automatic backup stays off', () => {
  const ui = buildICloudBackupUI(snapshot(), format, downloading);
  assert.equal(ui.confirmDirectly, true);
  assert.equal(ui.actions.length, 1);
  assert.match(ui.actions[0]!.confirmation.message, /2026\. 9\. 13\. 오후 1:05/);
  assert.equal(ui.enable, false);
  assert.doesNotMatch(ui.actions[0]!.confirmation.message, /자동 백업도 켜집니다/);
});

test('enabled conflict choices retain their captured token, generation and singleton identity', () => {
  const state = snapshot({ enabled: true, hasProfile: true });
  const ui = buildICloudBackupUI(state, format, { enable: false, allowLocal: true });
  assert.equal(ui.enable, true);
  assert.equal(ui.generation, 7);
  assert.equal(ui.token, '7:choice:1');
  assert.deepEqual(ui.actions.map(action => action.resolution), [
    { choice: 'cloud', token: '7:choice:1', backupID: undefined },
    { choice: 'local', token: '7:choice:1', backupID: undefined },
  ]);
  const newer = buildICloudBackupUI(snapshot({ generation: 8, conflict: { ...state.conflict!, token: '8:choice:2' } }), format, enabling);
  assert.equal(ui.actions[0]!.resolution.token, '7:choice:1');
  assert.equal(newer.actions[0]!.resolution.token, '8:choice:2');
});

test('first-use enable confirmation discloses backup activation and local guest import', () => {
  const ui = buildICloudBackupUI(snapshot(), format, enabling);
  assert.equal(ui.enable, true);
  assert.ok(ui.actions.every(action => action.confirmation.message.includes('자동 백업도 켜집니다')));
  assert.match(ui.actions.find(action => action.resolution.choice === 'local')!.confirmation.message, /게스트 기록과 설정/);
});

test('legacy migration labels and confirms each candidate with its own saved time and identity', () => {
  const candidates = [backup('7:0', true), backup('7:1', true, '2026-09-12T03:04:00.000Z')];
  const state = snapshot({ conflict: { ...snapshot().conflict!, backups: candidates } });
  const ui = buildICloudBackupUI(state, value => value, enabling);
  assert.equal(ui.confirmDirectly, false);
  assert.deepEqual(ui.actions.map(action => action.resolution.backupID), ['7:0', '7:1', '7:0']);
  assert.match(ui.actions[0]!.title, /2026-09-13T04:05:00.000Z/);
  assert.match(ui.actions[1]!.confirmation.message, /2026-09-12T03:04:00.000Z/);
  assert.doesNotMatch(ui.actions[1]!.confirmation.message, /2026-09-13/);
});

test('multiple modern or mixed candidates fail closed instead of offering replacement', () => {
  for (const legacy of [false, true]) {
    const ui = buildICloudBackupUI(snapshot({ conflict: { ...snapshot().conflict!,
      backups: [backup('7:0'), backup('7:1', legacy)] } }), format, enabling);
    assert.deepEqual(ui.actions, []);
    assert.match(ui.message, /다시/);
  }
});

test('manual download for a disabled existing profile offers only cloud without reenabling', () => {
  const ui = buildICloudBackupUI(snapshot({ hasProfile: true }), format, downloading);
  assert.deepEqual(ui.actions.map(action => action.resolution.choice), ['cloud']);
  assert.equal(ui.enable, false);
  assert.equal(ui.confirmDirectly, true);
});

test('an enabled empty-cloud conflict still offers explicit local replacement', () => {
  const ui = buildICloudBackupUI(snapshot({ enabled: true, hasProfile: true,
    conflict: { ...snapshot().conflict!, backups: [] } }), format, { enable: false, allowLocal: true });
  assert.deepEqual(ui.actions.map(action => action.resolution), [
    { choice: 'local', token: '7:choice:1', backupID: undefined },
  ]);
  assert.equal(ui.confirmDirectly, false);
});

test('empty manual download does not offer a destructive local replacement', () => {
  const ui = buildICloudBackupUI(snapshot({ conflict: { ...snapshot().conflict!, backups: [] } }), format, downloading);
  assert.deepEqual(ui.actions, []);
  assert.match(ui.message, /백업이 없어요/);
  assert.equal(ui.token, '7:choice:1'); // Dismissing the notice releases its read-only preview.
});

test('busy or unavailable snapshots cannot produce recovery actions', () => {
  for (const patch of [{ busy: true }, { ready: false }, { status: 'no-account' as const }]) {
    const ui = buildICloudBackupUI(snapshot(patch), format, enabling);
    assert.deepEqual(ui.actions, []);
  }
});

test('an invalid saved date is disclosed instead of formatting an invalid timestamp', () => {
  const ui = buildICloudBackupUI(snapshot({ conflict: { ...snapshot().conflict!,
    backups: [backup('7:0', false, 'invalid')] } }), () => { assert.fail('invalid dates must not reach the formatter'); }, downloading);
  assert.match(ui.actions[0]!.title, /날짜 확인 불가/);
  assert.match(ui.actions[0]!.confirmation.message, /날짜 확인 불가/);
});

test('no prepared conflict means no recovery action or stale confirmation token', () => {
  const ui = buildICloudBackupUI(snapshot({ conflict: null }), format, downloading);
  assert.deepEqual(ui.actions, []);
  assert.equal(ui.token, undefined);
});
