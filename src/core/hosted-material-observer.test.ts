import test from 'node:test';
import assert from 'node:assert/strict';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { observeHostedMaterial } from './hosted-material-observer';
import { materialActions } from './library-presentation';

for (const terminal of ['ready', 'cancelled', 'failed'] as const) {
  test(`replacement observer refreshes busy storage at ${terminal} without the detached download handler`, async () => {
    let native: DeliveryStatus = { phase: 'downloading', progress: 0.4 };
    let oldReads = 0;
    const old = observeHostedMaterial({
      readDelivery: async () => native, publish: () => {},
      refreshStorage: async () => { oldReads++; }, schedule: () => () => {},
    });
    await old.refresh();
    old.dispose();
    let storage = { bytes: 0, installed: false, busy: false };
    let phase: DeliveryStatus['phase'] = 'idle';
    let poll: (() => Promise<void>) | undefined;
    const current = observeHostedMaterial({
      readDelivery: async () => native, publish: value => { phase = value.phase; },
      refreshStorage: async () => {
        storage = native.phase === 'downloading' ? { bytes: 512, installed: false, busy: true }
          : { bytes: terminal === 'ready' ? 2048 : 0, installed: terminal === 'ready', busy: false };
        return storage;
      },
      schedule: callback => { poll = callback; return () => { poll = undefined; }; },
    });
    await current.refresh();
    assert.equal(storage.busy, true);
    assert.equal(materialActions({ ...storage, editing: false }).canStudy, false);
    native = { phase: terminal, progress: terminal === 'ready' ? 1 : 0 };
    assert.ok(poll);
    await poll();
    assert.equal(phase, terminal);
    assert.equal(storage.busy, false);
    assert.equal(materialActions({ ...storage, editing: false }).canStudy, terminal === 'ready');
    assert.equal(materialActions({ ...storage, editing: false }).canDownload, terminal !== 'ready');
    assert.equal(poll, undefined);
    await old.refresh();
    assert.equal(oldReads, 1);
    current.dispose();
  });
}

test('focus refresh observes a terminal installation even when no busy phase was seen', async () => {
  let installed = false;
  const observer = observeHostedMaterial({ readDelivery: async () => ({ phase: 'ready', progress: 1 }),
    publish: () => {}, refreshStorage: async () => { installed = true; },
    schedule: () => { throw new Error('terminal status must not poll'); } });
  await observer.refresh();
  assert.equal(installed, true);
  observer.dispose();
});

test('replacement observer keeps watching a cache purge while delivery is idle', async () => {
  let nativeBusy = true;
  let storageBusy = false;
  let poll: (() => Promise<void>) | undefined;
  const observer = observeHostedMaterial({ readDelivery: async () => ({ phase: 'idle', progress: 0 }),
    publish: () => {}, refreshStorage: async () => { storageBusy = nativeBusy; return { busy: nativeBusy }; },
    schedule: callback => { poll = callback; return () => { poll = undefined; }; } });
  await observer.refresh();
  assert.equal(storageBusy, true);
  assert.ok(poll);
  nativeBusy = false;
  await poll();
  assert.equal(storageBusy, false);
  assert.equal(poll, undefined);
  observer.dispose();
});
