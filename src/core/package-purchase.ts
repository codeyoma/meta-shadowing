import type { StoreSnapshot } from '../../modules/package-store/src/PackageStore.types';

/** Presentation only. The native StoreKit boundary supplies verified ownership. */
export function purchasePresentation(snapshot: StoreSnapshot) {
  const owned = snapshot.ownership === 'owned';
  const uncertain = snapshot.entitlementIssue !== 'none' || snapshot.ownership === 'unknown';
  const pending = snapshot.outcome === 'pending';
  const offer = snapshot.product && snapshot.catalogIssue === 'none';
  return {
    title: snapshot.product?.title ?? '학습 패키지',
    canPurchase: !!offer && !owned && !snapshot.busy && !uncertain && !pending,
    status: owned ? '구매 완료 · 미다운로드' : pending ? '구매 승인 대기 중'
      : uncertain ? '구매 내역 확인 필요' : offer ? `${snapshot.product!.price} · 한 번 구매` : '지금은 구매할 수 없어요',
    detail: '다운로드 기능은 준비 중이에요. 구매만으로 학습을 시작할 수는 없어요.',
  };
}
