import test from 'node:test';
import assert from 'node:assert/strict';
import { purchasePresentation } from './package-purchase';

test('verified ownership never offers a download or playable package before delivery exists', () => {
  const result = purchasePresentation({ revision: 3, busy: false, product: { id: 'test.book', title: 'Store Title', price: '$29.00' },
    ownership: 'owned', outcome: 'purchased', entitlementIssue: 'none', catalogIssue: 'none' });
  assert.equal(result.title, 'Store Title');
  assert.equal(result.canPurchase, false);
  assert.equal(result.status, '구매 완료 · 미다운로드');
  assert.match(result.detail, /다운로드 기능은 준비 중/);
});

test('offers only a loaded StoreKit product with a confirmed lack of entitlement', () => {
  const base = { revision: 1, busy: false, ownership: 'notOwned', outcome: 'none', entitlementIssue: 'none', catalogIssue: 'none' } as const;
  assert.equal(purchasePresentation(base).canPurchase, false);
  const loaded = { ...base, product: { id: 'test.book', title: 'Localized Book', price: '₩29,000' } };
  assert.equal(purchasePresentation(loaded).canPurchase, true);
  assert.equal(purchasePresentation(loaded).status, '₩29,000 · 한 번 구매');
  assert.equal(purchasePresentation({ ...loaded, busy: true }).canPurchase, false);
  assert.equal(purchasePresentation({ ...loaded, ownership: 'unknown' }).canPurchase, false);
  assert.equal(purchasePresentation({ ...loaded, outcome: 'pending' }).canPurchase, false);
  assert.equal(purchasePresentation({ ...loaded, entitlementIssue: 'unverified' }).canPurchase, false);
});
