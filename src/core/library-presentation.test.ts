import test from 'node:test';
import assert from 'node:assert/strict';
import type { StoreSnapshot } from '../../modules/package-store/src/PackageStore.types';
import { canRetryStorageRead, formatMaterialBytes, materialActions, paidLibraryEntry,
  refreshHostedMaterial, sampleLibraryEntry } from './library-presentation';

const snapshot = (values: Partial<StoreSnapshot> = {}): StoreSnapshot => ({
  revision: 1, busy: false, ownership: 'notOwned', outcome: 'none',
  entitlementIssue: 'none', catalogIssue: 'none',
  product: { id: 'store.book', title: 'Localized Book', price: '₩29,000' }, ...values,
});

test('controlled catalog packages are labeled samples in the owned section without claiming a receipt', () => {
  assert.deepEqual(sampleLibraryEntry(), { section: 'owned', badge: '샘플', receiptOwned: false });
});

test('verified paid ownership alone moves the unmapped product to owned and keeps study and download disabled', () => {
  assert.deepEqual(paidLibraryEntry(snapshot({ ownership: 'owned', outcome: 'purchased' })), {
    section: 'owned', title: 'Localized Book', price: '₩29,000', canPurchase: false,
    status: '학습 자료 준비 중', canStudy: false, canDownload: false, canRetry: false,
  });
  assert.equal(paidLibraryEntry(snapshot({ ownership: 'owned', entitlementIssue: 'failed' })).section, 'owned');
});

test('not-owned, unknown, pending and failed paid states stay in store without fabricating purchase permission', () => {
  assert.deepEqual([
    paidLibraryEntry(snapshot()).section,
    paidLibraryEntry(snapshot({ ownership: 'unknown' })).section,
    paidLibraryEntry(snapshot({ outcome: 'pending' })).section,
    paidLibraryEntry(snapshot({ catalogIssue: 'failed', entitlementIssue: 'failed' })).section,
  ], ['store', 'store', 'store', 'store']);
  assert.equal(paidLibraryEntry(snapshot()).canPurchase, true);
  assert.equal(paidLibraryEntry(snapshot({ ownership: 'unknown' })).canPurchase, false);
  assert.equal(paidLibraryEntry(snapshot({ outcome: 'pending' })).canPurchase, false);
  assert.equal(paidLibraryEntry(snapshot({ entitlementIssue: 'failed' })).canPurchase, false);
});

test('missing localized StoreKit price is disclosed and disables purchase', () => {
  const entry = paidLibraryEntry(snapshot({ product: undefined }));
  assert.equal(entry.price, '가격 확인 불가');
  assert.equal(entry.canPurchase, false);
  assert.equal(entry.canRetry, true);
});

test('local material size uses binary units and does not imply reclaimed disk allocation', () => {
  assert.equal(formatMaterialBytes(0), '0 B');
  assert.equal(formatMaterialBytes(1023), '1,023 B');
  assert.equal(formatMaterialBytes(1024), '1.0 KB');
  assert.equal(formatMaterialBytes(1536), '1.5 KB');
  assert.equal(formatMaterialBytes(1024 * 1024), '1.0 MB');
});

test('material controls separate study, download and edit removal across verification and busy states', () => {
  assert.deepEqual(materialActions({ installed: true, busy: false, editing: false }),
    { canStudy: true, canDownload: false, canRemove: false, downloadState: 'downloaded', primaryAction: 'study' });
  assert.deepEqual(materialActions({ installed: false, busy: false, editing: false }),
    { canStudy: false, canDownload: true, canRemove: false, downloadState: 'download', primaryAction: 'download' });
  assert.deepEqual(materialActions({ installed: true, busy: false, editing: true }),
    { canStudy: false, canDownload: false, canRemove: true, downloadState: 'downloaded', primaryAction: 'study' });
  assert.deepEqual(materialActions({ installed: true, busy: true, editing: true }),
    { canStudy: false, canDownload: false, canRemove: false, downloadState: 'busy', primaryAction: 'study' });
});

test('the single primary action follows installation while busy and read failures keep it locked', () => {
  for (const installed of [false, true]) {
    for (const blocked of [{ busy: true }, { readFailed: true }, { editing: true }]) {
      const actions = materialActions({ installed, busy: false, editing: false, ...blocked });
      assert.equal(actions.primaryAction, installed ? 'study' : 'download');
      assert.equal(actions.canStudy, false);
      assert.equal(actions.canDownload, false);
    }
  }
});

test('incomplete Apple cache cleanup stays retryable after the local copy is gone', () => {
  assert.deepEqual(materialActions({ installed: false, busy: false, editing: true, cacheRetry: true }),
    { canStudy: false, canDownload: false, canRemove: true, downloadState: 'download', primaryAction: 'download' });
});

test('hosted download completion refreshes missing delivery and storage into one ready view', async () => {
  let delivered = false;
  let delivery = { phase: 'failed', progress: 0 };
  let storage = { bytes: 0, installed: false, busy: false };
  delivered = true;
  await refreshHostedMaterial(
    async () => { delivery = delivered ? { phase: 'ready', progress: 1 } : delivery; },
    async () => { storage = delivered ? { bytes: 2048, installed: true, busy: false } : storage; },
  );
  assert.deepEqual(delivery, { phase: 'ready', progress: 1 });
  assert.deepEqual(storage, { bytes: 2048, installed: true, busy: false });
  assert.equal(materialActions({ installed: storage.installed, busy: false, editing: false }).canStudy, true);
});

test('failed storage information exposes retry unless a package operation is busy', () => {
  assert.equal(canRetryStorageRead(true, false), true);
  assert.equal(canRetryStorageRead(true, true), false);
  assert.equal(canRetryStorageRead(false, false), false);
});

test('damaged and partial measured material can be deleted without becoming playable', () => {
  for (const bytes of [1, 2048]) {
    const input = { installed: false, busy: false, editing: true, bytes };
    assert.equal(materialActions(input).canRemove, true);
    assert.equal(materialActions({ ...input, editing: false }).canStudy, false);
    assert.equal(materialActions({ ...input, busy: true }).canRemove, false);
    assert.equal(materialActions({ ...input, readFailed: true }).canRemove, false);
  }
});

test('absent hosted material retains safe cache cleanup after failed purge and fresh UI initialization', () => {
  const absent = { installed: false, busy: false, editing: true, bytes: 0, hosted: true };
  assert.equal(materialActions({ ...absent, cacheRetry: true }).canRemove, true);
  assert.equal(materialActions({ ...absent, cacheRetry: false }).canRemove, true);
  assert.equal(materialActions({ ...absent, hosted: false }).canRemove, false);
  assert.equal(materialActions({ ...absent, busy: true }).canRemove, false);
  assert.equal(materialActions({ ...absent, readFailed: true }).canRemove, false);
  assert.equal(materialActions({ ...absent, bytes: undefined }).canRemove, false);
  for (const bytes of [NaN, Infinity, -1]) {
    assert.equal(materialActions({ ...absent, bytes }).canRemove, false);
  }
  const failed = materialActions({ ...absent, editing: false, readFailed: true });
  assert.equal(failed.canDownload, false);
  assert.equal(failed.canStudy, false);
});
