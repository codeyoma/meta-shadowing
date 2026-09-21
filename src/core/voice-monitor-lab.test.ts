import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceMonitorLab, monitorPresentation, type MonitorStatus } from './voice-monitor-lab';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const calls: string[] = [];
  const port = { enableMonitor: async () => { calls.push('enable'); }, disableMonitor: async () => { calls.push('stop'); } };
  const lease = { suspend: async () => { calls.push('suspend'); }, restore: async () => { calls.push('restore'); } };
  return { calls, port, lease };
}

function monitorStatus(overrides: Partial<MonitorStatus> = {}): MonitorStatus {
  return { state: 'off', output: 'headphones', permission: 'granted', invalidationVersion: 0, input: null,
    gain: 0.25, sampleRate: null, bufferSeconds: null, inputLatencySeconds: null,
    outputLatencySeconds: null, ...overrides };
}
const activeLearning = { foreground: true, eligible: true };
async function automaticFixture() {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  await lab.navigationChanged({ routes: [{ name: 'player' }] });
  return { ...f, lab };
}

test('entering with wired headphones auto-enables once; status refreshes and menus do not restart it', async () => {
  const f = await automaticFixture();
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  await f.lab.automaticChanged(monitorStatus({ state: 'monitoring' }), activeLearning);
  await f.lab.navigationChanged({ routes: [{ name: 'player-options' }] });
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  assert.deepEqual(f.calls, ['suspend', 'enable']);
});

test('manual OFF stays off until a physical disconnect and reconnect', async () => {
  const f = await automaticFixture();
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  await f.lab.disable();
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  await f.lab.automaticChanged(monitorStatus(), { ...activeLearning, foreground: false });
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  assert.deepEqual(f.calls, ['suspend', 'enable', 'stop']);
  await f.lab.automaticChanged(monitorStatus({ output: 'unsupported' }), activeLearning);
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  assert.deepEqual(f.calls, ['suspend', 'enable', 'stop', 'enable']);
});

test('automatic capture waits for foreground, eligible learning and an observed player route', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  await lab.automaticChanged(monitorStatus(), activeLearning);
  assert.equal(f.calls.length, 0);
  await lab.navigationChanged({ routes: [{ name: 'player' }] });
  await lab.automaticChanged(monitorStatus(), { foreground: false, eligible: true });
  await lab.automaticChanged(monitorStatus(), { foreground: true, eligible: false });
  assert.equal(f.calls.length, 0);
  await lab.automaticChanged(monitorStatus(), activeLearning);
  assert.deepEqual(f.calls, ['suspend', 'enable']);
});

test('automatic capture never runs in Release, the lab, or with denied/unknown permission', async () => {
  for (const [development, route] of [[false, 'player'], [true, 'monitoring-lab']] as const) {
    const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, development, route);
    await lab.navigationChanged({ routes: [{ name: route }] });
    await lab.automaticChanged(monitorStatus(), activeLearning);
    assert.equal(f.calls.length, 0);
  }
  const f = await automaticFixture();
  await f.lab.automaticChanged(monitorStatus({ permission: 'denied' }), activeLearning);
  await f.lab.automaticChanged(monitorStatus({ permission: undefined }), activeLearning);
  await f.lab.automaticChanged(monitorStatus({ output: 'unsupported' }), activeLearning);
  assert.equal(f.calls.length, 0);
});

test('disconnect, exit and manual OFF cancel automatic enable awaiting audio ownership', async () => {
  for (const cancel of ['disconnect', 'exit', 'off', 'background'] as const) {
    const f = await automaticFixture(), pending = deferred();
    f.lease.suspend = async () => { f.calls.push('suspend'); await pending.promise; };
    const enabling = f.lab.automaticChanged(monitorStatus(), activeLearning);
    const stopping = cancel === 'exit' ? f.lab.close() : cancel === 'off' ? f.lab.disable()
      : f.lab.automaticChanged(monitorStatus({ output: cancel === 'disconnect' ? 'none' : 'headphones' }),
        { ...activeLearning, foreground: cancel !== 'background' });
    pending.resolve();
    await Promise.all([enabling, stopping]);
    assert.ok(!f.calls.includes('enable'), cancel);
  }
});

test('a first permission grant retries the cancelled prompt request only while the same lesson is eligible', async () => {
  const f = fixture(), pending = deferred();
  const port = { ...f.port, monitorStatus: async () => monitorStatus() };
  port.enableMonitor = async () => { f.calls.push('enable'); if (f.calls.filter(x => x === 'enable').length === 1) await pending.promise; };
  const lab = new VoiceMonitorLab(port, f.lease, true, 'player');
  await lab.navigationChanged({ routes: [{ name: 'player' }] });
  const enabling = lab.automaticChanged(monitorStatus({ permission: 'undetermined' }), activeLearning);
  await Promise.resolve(); await Promise.resolve();
  await lab.automaticChanged(monitorStatus({ state: 'requesting', permission: 'undetermined' }), { ...activeLearning, foreground: false });
  pending.resolve(); await enabling;
  assert.equal(f.calls.filter(x => x === 'enable').length, 1);
  await lab.automaticChanged(monitorStatus(), activeLearning);
  assert.equal(f.calls.filter(x => x === 'enable').length, 2);
});

test('a not-yet-dispatched automatic attempt resumes after foreground/readiness returns', async () => {
  for (const context of [{ foreground: false, eligible: true }, { foreground: true, eligible: false }]) {
    const f = await automaticFixture(), pending = deferred();
    f.lease.suspend = async () => { f.calls.push('suspend'); await pending.promise; };
    const enabling = f.lab.automaticChanged(monitorStatus(), activeLearning);
    await f.lab.automaticChanged(monitorStatus(), context);
    pending.resolve(); await enabling;
    assert.ok(!f.calls.includes('enable'));
    await f.lab.automaticChanged(monitorStatus(), activeLearning);
    assert.equal(f.calls.filter(x => x === 'enable').length, 1);
  }
});

test('interruptions and engine errors do not automatically restart the same wired connection', async () => {
  const f = await automaticFixture();
  await f.lab.automaticChanged(monitorStatus(), activeLearning);
  for (const state of ['monitoring', 'off', 'failed', 'blocked'] as const) {
    await f.lab.automaticChanged(monitorStatus({ state }), activeLearning);
  }
  assert.equal(f.calls.filter(x => x === 'enable').length, 1);
});

test('an invalidation while waiting for audio ownership cancels the reserved start', async () => {
  const f = await automaticFixture(), pending = deferred();
  f.lease.suspend = async () => { await pending.promise; };
  const enabling = f.lab.automaticChanged(monitorStatus(), activeLearning);
  await f.lab.automaticChanged(monitorStatus({ invalidationVersion: 1 }), activeLearning);
  pending.resolve(); await enabling;
  await f.lab.automaticChanged(monitorStatus({ invalidationVersion: 1 }), activeLearning);
  assert.ok(!f.calls.includes('enable'));
});

test('manual OFF during a permission request cannot be undone by its late grant', async () => {
  const f = fixture(), pending = deferred();
  const port = { ...f.port, monitorStatus: async () => monitorStatus(),
    enableMonitor: async () => { f.calls.push('enable'); await pending.promise; } };
  const lab = new VoiceMonitorLab(port, f.lease, true, 'player');
  await lab.navigationChanged({ routes: [{ name: 'player' }] });
  const enabling = lab.automaticChanged(monitorStatus({ permission: 'undetermined' }), activeLearning);
  await Promise.resolve(); await Promise.resolve();
  await lab.disable(); pending.resolve(); await enabling;
  await lab.automaticChanged(monitorStatus(), activeLearning);
  assert.equal(f.calls.filter(x => x === 'enable').length, 1);
});

test('native interruptions during permission or its deferred retry cannot auto-restart capture', async () => {
  for (const interruptedDuringPrompt of [true, false]) {
    const f = fixture(), pending = deferred();
    const port = { ...f.port,
      monitorStatus: async () => monitorStatus({ invalidationVersion: interruptedDuringPrompt ? 1 : 0 }),
      enableMonitor: async () => { f.calls.push('enable'); await pending.promise; } };
    const lab = new VoiceMonitorLab(port, f.lease, true, 'player');
    await lab.navigationChanged({ routes: [{ name: 'player' }] });
    const enabling = lab.automaticChanged(monitorStatus({ permission: 'undetermined' }), activeLearning);
    await Promise.resolve(); await Promise.resolve();
    await lab.automaticChanged(monitorStatus({ permission: 'undetermined' }), { ...activeLearning, foreground: false });
    pending.resolve(); await enabling;
    await lab.automaticChanged(monitorStatus({ invalidationVersion: 1 }), activeLearning);
    assert.equal(f.calls.filter(x => x === 'enable').length, 1);
  }
});

test('lab opens without microphone permission and owns Expo session before enabling', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true);
  await lab.open();
  assert.deepEqual(f.calls, ['suspend']);
  await lab.enable();
  await lab.close();
  assert.deepEqual(f.calls, ['suspend', 'enable', 'stop', 'restore']);
  await lab.close();
  assert.equal(f.calls.filter(x => x === 'restore').length, 1);
});

test('close while acquiring lease prevents a queued enable and restores after suspend completes', async () => {
  const f = fixture(), pending = deferred();
  f.lease.suspend = async () => { f.calls.push('suspend'); await pending.promise; };
  const lab = new VoiceMonitorLab(f.port, f.lease, true);
  const enabling = lab.enable();
  const closing = lab.close();
  pending.resolve();
  await Promise.all([enabling, closing]);
  assert.ok(!f.calls.includes('enable'));
  assert.equal(f.calls.at(-1), 'restore');
});

test('close cancels native permission without waiting for its response or reactivating afterwards', async () => {
  const f = fixture(), pending = deferred();
  f.port.enableMonitor = async () => { f.calls.push('enable'); await pending.promise; };
  const lab = new VoiceMonitorLab(f.port, f.lease, true);
  await lab.open();
  const enabling = lab.enable();
  await Promise.resolve();
  await lab.close();
  const snapshot = [...f.calls];
  pending.resolve();
  await enabling;
  assert.deepEqual(f.calls, snapshot);
  assert.deepEqual(f.calls.slice(-2), ['stop', 'restore']);
});

test('Release is inert and a failed suspend never enables capture', async () => {
  const f = fixture(), release = new VoiceMonitorLab(f.port, f.lease, false);
  await assert.rejects(release.open(), /development/);
  await assert.rejects(release.enable(), /development/);
  await release.close();
  assert.equal(f.calls.length, 0);
  f.lease.suspend = async () => { throw Error('suspend failed'); };
  const lab = new VoiceMonitorLab(f.port, f.lease, true);
  await assert.rejects(lab.enable(), /suspend failed/);
  assert.ok(!f.calls.includes('enable'));
  await lab.close();
});

test('restore failure is retryable but closed lab cannot restart monitoring', async () => {
  const f = fixture();
  let attempts = 0;
  f.lease.restore = async () => { if (++attempts === 1) throw Error('restore failed'); };
  const lab = new VoiceMonitorLab(f.port, f.lease, true);
  await lab.enable();
  await assert.rejects(lab.close(), /restore failed/);
  await lab.enable();
  assert.equal(f.calls.filter(x => x === 'enable').length, 1);
  await lab.close();
  assert.equal(attempts, 2);
});

test('compact learning menu stays quiet during normal monitoring without changing control gates', () => {
  for (const state of ['off', 'requesting', 'monitoring'] as const) {
    const compact = monitorPresentation(true, state, 'headphones', 'compact');
    const full = monitorPresentation(true, state, 'headphones');
    assert.equal(compact.message, '');
    assert.equal(compact.canEnable, full.canEnable);
    assert.equal(compact.canPlay, full.canPlay);
  }
});

test('compact learning menu retains permission, connection and failure recovery messages', () => {
  assert.match(monitorPresentation(true, 'denied', 'headphones', 'compact').message, /마이크/);
  for (const output of ['none', 'unsupported'] as const) {
    const view = monitorPresentation(true, 'off', output, 'compact');
    assert.ok(view.message.length > 0);
    assert.equal(view.canEnable, false);
  }
  assert.ok(monitorPresentation(true, 'failed', 'headphones', 'compact').message.length > 0);
  assert.equal(monitorPresentation(false, 'off', 'headphones', 'compact').available, false);
});

test('presentation gates Release and describes denied or unsupported routes', () => {
  assert.equal(monitorPresentation(false, 'off', 'headphones').available, false);
  assert.equal(monitorPresentation(true, 'off', 'unsupported').canEnable, false);
  assert.match(monitorPresentation(true, 'denied', 'headphones').message, /마이크/);
  assert.equal(monitorPresentation(true, 'monitoring', 'headphones').canPlay, true);
  assert.equal(monitorPresentation(true, 'requesting', 'headphones').canEnable, false);
});

test('temporary menus keep the monitor lease, but navigating out stops and restores it', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true);
  await lab.enable();
  for (const route of ['player-options', 'player-info', 'languages', 'monitoring-lab']) {
    await lab.navigationChanged({ index: 0, routes: [{ name: route }] });
  }
  assert.deepEqual(f.calls, ['suspend', 'enable']);
  await lab.navigationChanged({ index: 0, routes: [{ name: '(tabs)' }] });
  assert.deepEqual(f.calls, ['suspend', 'enable', 'stop', 'restore']);
  await lab.navigationChanged({ index: 0, routes: [{ name: 'monitoring-lab' }] });
  await lab.enable();
  assert.equal(f.calls.filter(call => call === 'enable').length, 1);
});

test('Expo root wrapper does not close the lab before the first switch tap', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true);
  const state = (name: string) => ({ index: 0, routes: [{ name: '__root', state: {
    index: 1, routes: [{ name: '(tabs)' }, { name }],
  } }] });
  await lab.open();
  await lab.navigationChanged(state('monitoring-lab'));
  await lab.enable();
  assert.deepEqual(f.calls, ['suspend', 'enable']);
  await lab.navigationChanged(state('player-options'));
  await lab.navigationChanged(state('monitoring-lab'));
  assert.deepEqual(f.calls, ['suspend', 'enable']);
  await lab.navigationChanged(state('(tabs)'));
  assert.deepEqual(f.calls, ['suspend', 'enable', 'stop', 'restore']);
});

test('lesson monitoring survives its menus, but exits and pending playback cannot revive it', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  await lab.open();
  for (const name of ['player', 'player-options', 'player-info', 'languages', 'player']) {
    await lab.navigationChanged({ index: 0, routes: [{ name }] });
  }
  await lab.enable();
  await lab.preparePlayback(async () => { f.calls.push('prepare'); });
  assert.deepEqual(f.calls, ['suspend', 'enable', 'prepare']);
  await lab.navigationChanged({ index: 0, routes: [{ name: 'lesson' }] });
  await assert.rejects(lab.preparePlayback(async () => { f.calls.push('unexpected'); }));
  assert.deepEqual(f.calls, ['suspend', 'enable', 'prepare', 'stop', 'restore']);
});

test('leaving while lesson audio awaits ownership prevents late session configuration', async () => {
  const f = fixture(), pending = deferred();
  f.lease.suspend = async () => { f.calls.push('suspend'); await pending.promise; };
  const lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  const preparing = lab.preparePlayback(async () => { f.calls.push('configure'); });
  const rejected = assert.rejects(preparing, /ended/);
  const closing = lab.close();
  pending.resolve();
  await Promise.all([rejected, closing]);
  assert.deepEqual(f.calls, ['suspend', 'stop', 'restore']);
  assert.equal(lab.available, false);
});

test('temporary access loss stops capture but recovered lesson playback still works without auto-enable', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  const route = { index: 0, routes: [{ name: 'player' }] };
  await lab.enable();
  await lab.learningChanged(route, { blocked: true, complete: false });
  await lab.learningChanged(route, { blocked: false, complete: false });
  await lab.preparePlayback(async () => { f.calls.push('prepare'); });
  assert.deepEqual(f.calls, ['suspend', 'enable', 'stop', 'prepare']);
  await lab.learningChanged(route, { blocked: false, complete: true });
  assert.equal(lab.available, false);
  assert.deepEqual(f.calls.slice(-2), ['stop', 'restore']);
});

test('the previous navigation snapshot on mount does not terminate an entering lesson', async () => {
  const f = fixture(), lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  const state = (name: string) => ({ index: 0, routes: [{ name: '__root', state: {
    index: 0, routes: [{ name }],
  } }] });
  await lab.open();
  // Expo updates its navigation snapshot in a parent layout effect. The new
  // screen's first render can still see the previous (tabs) route.
  await lab.learningChanged(state('(tabs)'), { blocked: false, complete: false });
  await lab.learningChanged(state('player'), { blocked: false, complete: false });
  await lab.preparePlayback(async () => { f.calls.push('prepare'); });
  await lab.enable();
  assert.deepEqual(f.calls, ['suspend', 'prepare', 'enable']);
  await lab.navigationChanged(state('player-options'));
  await lab.navigationChanged(state('player'));
  assert.equal(lab.available, true);
  await lab.navigationChanged(state('(tabs)'));
  assert.deepEqual(f.calls.slice(-2), ['stop', 'restore']);
  await assert.rejects(lab.preparePlayback(async () => {}), /ended/);
});

test('actual removal before navigation catches up still cancels pending activation', async () => {
  const f = fixture(), pending = deferred();
  f.lease.suspend = async () => { f.calls.push('suspend'); await pending.promise; };
  const lab = new VoiceMonitorLab(f.port, f.lease, true, 'player');
  const enabling = lab.enable();
  const navigation = lab.navigationChanged({ index: 0, routes: [{ name: '(tabs)' }] });
  // beforeRemove/unmount closes explicitly, even without a home snapshot.
  const closing = lab.close();
  pending.resolve();
  await Promise.all([enabling, closing, navigation]);
  assert.deepEqual(f.calls, ['suspend', 'stop', 'restore']);
});
