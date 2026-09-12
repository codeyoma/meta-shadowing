import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncSnapshot } from './progress-sync';
import { buildICloudBackupUI } from './icloud-backup-ui';

const backup = (id: string, legacy = false) => ({
  id, createdAt: '2026-09-13T04:05:00.000Z', revision: 41, token: 'opaque-head', legacy,
});
const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  profile: 'guest', generation: 7, status: 'available', hasProfile: false,
  enabled: false, ready: true, busy: false, pending: false, error: null,
  backups: [], conflict: null, cleanupPending: false, ...patch,
});
const format = () => '2026. 9. 13. 오후 1:05';

test('a singleton backup produces one recovery action with its saved date and time', () => {
  const ui = buildICloudBackupUI(snapshot({ backups: [backup('7:0')] }), format);

  assert.deepEqual(ui.actions.filter(action => action.kind === 'restore'), [{ kind: 'restore', title: '백업 복구 · 2026. 9. 13. 오후 1:05', backupID: '7:0', disabled: false }]);
});

test('only divergent legacy migration produces multiple recovery choices', () => {
  const ui = buildICloudBackupUI(snapshot({ backups: [backup('7:0', true), backup('7:1', true)] }), (_value, index) => `저장 시각 ${index + 1}`);

  assert.equal(ui.notice, '이전 방식의 백업 기록이 여러 개 있어요. 옮겨올 기록을 직접 선택해 주세요. 기록은 합쳐지지 않아요.');
  assert.deepEqual(ui.actions.filter(action => action.kind === 'restore').map(action => action.title), [
    '클라우드 기록 이어받기 · 저장 시각 1',
    '클라우드 기록 이어받기 · 저장 시각 2',
  ]);
  assert.deepEqual(ui.actions.filter(action => action.kind === 'restore').map(action => action.kind), ['restore', 'restore']);
});

test('multiple nonlegacy candidates fail closed instead of becoming a version menu', () => {
  const ui = buildICloudBackupUI(snapshot({ backups: [backup('7:0'), backup('7:1')] }), format);

  assert.equal(ui.actions.some(action => action.kind === 'restore'), false);
  assert.match(ui.notice ?? '', /다시 확인/);
});

test('enabled conflict actions capture the displayed token and selected singleton identity', () => {
  const state = snapshot({ hasProfile: true, enabled: true, backups: [backup('7:0')], conflict: {
    token: '7:choice:2', profile: 'profile-a', localRevision: 9, generation: 7, backups: [backup('7:0')],
  } });
  const ui = buildICloudBackupUI(state, format);

  const resolutions = ui.actions.filter(action => action.kind === 'resolve');
  assert.deepEqual(resolutions.map(action => action.title), ['클라우드 기록 이어받기', '이 기기 기록으로 백업 교체']);
  assert.deepEqual(resolutions.map(action => action.resolution), [
    { choice: 'cloud', token: '7:choice:2', backupID: undefined },
    { choice: 'local', token: '7:choice:2', backupID: undefined },
  ]);
  assert.match(resolutions[0]!.confirmation!.message, /이 기기에서 아직 동기화되지 않은 학습 기록/);
  assert.match(resolutions[1]!.confirmation!.message, /클라우드에만 있는 학습 기록/);

  const newer = buildICloudBackupUI(snapshot({ ...state, conflict: { ...state.conflict!, token: '7:choice:3' } }), format);
  assert.equal(resolutions[0]!.resolution!.token, '7:choice:2');
  assert.equal(newer.actions.find(action => action.kind === 'resolve')!.resolution!.token, '7:choice:3');
});

test('a first-use conflict explicitly opts into backup for either guest import or cloud records', () => {
  const state = snapshot({ backups: [backup('7:0')], conflict: {
    token: '7:choice:1', profile: 'guest', localRevision: 3, generation: 7, backups: [backup('7:0')],
  } });
  const ui = buildICloudBackupUI(state, format);
  const resolutions = ui.actions.filter(action => action.kind === 'resolve');

  assert.match(resolutions[0]!.confirmation!.message, /iCloud 백업을 켜고/);
  assert.match(resolutions[0]!.confirmation!.message, /클라우드 기록/);
  assert.match(resolutions[1]!.confirmation!.message, /iCloud 백업을 켜고/);
  assert.match(resolutions[1]!.confirmation!.message, /이 기기의 게스트 기록과 설정을 가져와/);
});

test('a multiple-legacy conflict binds every resolution to a displayed backup identity', () => {
  const candidates = [backup('7:0', true), backup('7:1', true)];
  const ui = buildICloudBackupUI(snapshot({ enabled: true, hasProfile: true, backups: candidates, conflict: {
    token: '7:choice:5', profile: 'profile-a', localRevision: 5, generation: 7, backups: candidates,
  } }), format);

  const resolutions = ui.actions.filter(action => action.kind === 'resolve');
  assert.deepEqual(resolutions.map(action => action.resolution?.backupID), ['7:0', '7:1', '7:0']);
});

test('an existing disabled profile exposes re-enable but no conflict resolution', () => {
  const state = snapshot({ hasProfile: true, backups: [backup('7:0')], conflict: {
    token: '7:choice:4', profile: 'profile-a', localRevision: 4, generation: 7, backups: [backup('7:0')],
  } });
  const ui = buildICloudBackupUI(state, format);

  assert.deepEqual(ui.actions.filter(action => action.kind !== 'retry'), [{ kind: 'enable', title: '이 기록의 백업 다시 켜기', importGuest: false, generation: 7, disabled: false }]);
});

test('an enabled empty-cloud conflict can replace cloud with local and still allows disabling backup', () => {
  const ui = buildICloudBackupUI(snapshot({ enabled: true, hasProfile: true, conflict: {
    token: '7:choice:6', profile: 'profile-a', localRevision: 6, generation: 7, backups: [],
  } }), format);

  const resolutions = ui.actions.filter(action => action.kind === 'resolve');
  assert.deepEqual(resolutions.map(action => action.title), ['이 기기 기록으로 백업 교체']);
  assert.deepEqual(resolutions[0]!.resolution, { choice: 'local', token: '7:choice:6', backupID: undefined });
  assert.equal(ui.actions.some(action => action.kind === 'disable'), true);
});

test('busy and unavailable states disable every operation and cleanup remains actionable', () => {
  const busy = buildICloudBackupUI(snapshot({ busy: true, backups: [backup('7:0')] }), format);
  assert.ok(busy.actions.length > 0);
  assert.ok(busy.actions.every(action => action.disabled));

  const unavailable = buildICloudBackupUI(snapshot({ status: 'unavailable', ready: false }), format);
  assert.deepEqual(unavailable.actions.map(action => action.kind), ['retry']);
  assert.equal(unavailable.actions.some(action => action.kind === 'enable' || action.kind === 'restore' || action.kind === 'resolve'), false);

  const cleanup = buildICloudBackupUI(snapshot({ hasProfile: true, enabled: true, cleanupPending: true }), format);
  assert.match(cleanup.notice ?? '', /정리/);
  assert.match(cleanup.notice ?? '', /다른 기기/);
  assert.equal(cleanup.actions.some(action => action.kind === 'retry'), true);
});
