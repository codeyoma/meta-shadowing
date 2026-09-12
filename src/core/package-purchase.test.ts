import test from 'node:test';
import assert from 'node:assert/strict';
import { purchasePresentation, restorePresentation } from './package-purchase';

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

test('restoration reports verified purchases without granting unowned books or starting downloads', () => {
  const restored = { revision: 2, busy: false, ownership: 'owned', outcome: 'restored', entitlementIssue: 'none', catalogIssue: 'none' } as const;
  assert.equal(restorePresentation(restored), '구매 내역을 복원했어요. 도서에서 구매한 상품을 확인해 주세요. 다운로드는 별도로 진행해요.');
  assert.equal(restorePresentation({ ...restored, ownership: 'notOwned' }), '현재 App Store 계정에서 구매 내역을 찾지 못했어요. 구매하지 않은 상품은 구매 버튼으로 남아요.');
  assert.equal(purchasePresentation({ ...restored, ownership: 'notOwned', product: { id: 'test.book', title: 'Book', price: '₩29,000' } }).canPurchase, true);
  assert.equal(restorePresentation({ ...restored, outcome: 'none' }), null);
});

test('restore feedback distinguishes uncertain ownership from confirmed absence', () => {
  const base = { revision: 1, busy: false, ownership: 'unknown', outcome: 'restored', entitlementIssue: 'none', catalogIssue: 'none' } as const;
  assert.equal(restorePresentation(base), '구매 내역을 아직 확인하지 못했어요. 연결을 확인하고 다시 복원해 주세요.');
  assert.equal(restorePresentation({ ...base, ownership: 'owned', entitlementIssue: 'unverified' }), '구매 내역을 검증하지 못했어요. 이전 구매가 취소되었다는 뜻은 아니에요. 다시 복원해 주세요.');
  assert.equal(restorePresentation({ ...base, outcome: 'failed' }), '구매 복원을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  assert.equal(restorePresentation({ ...base, outcome: 'unavailable' }), '구매 복원 설정이 준비되지 않았어요. 앱을 업데이트한 뒤 다시 시도해 주세요.');
  assert.equal(restorePresentation({ ...base, busy: true }), null);
});
