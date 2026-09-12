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

export function restorePresentation(snapshot: StoreSnapshot): string | null {
  if (snapshot.busy) return null;
  if (snapshot.outcome === 'unavailable') return '구매 복원 설정이 준비되지 않았어요. 앱을 업데이트한 뒤 다시 시도해 주세요.';
  if (snapshot.entitlementIssue === 'unverified' || snapshot.outcome === 'unverified')
    return '구매 내역을 검증하지 못했어요. 이전 구매가 취소되었다는 뜻은 아니에요. 다시 복원해 주세요.';
  if (snapshot.outcome === 'failed' || snapshot.entitlementIssue === 'failed')
    return '구매 복원을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
  if (snapshot.outcome !== 'restored') return null;
  if (snapshot.ownership === 'unknown') return '구매 내역을 아직 확인하지 못했어요. 연결을 확인하고 다시 복원해 주세요.';
  return snapshot.ownership === 'owned'
    ? '구매 내역을 복원했어요. 도서에서 구매한 상품을 확인해 주세요. 다운로드는 별도로 진행해요.'
    : '현재 App Store 계정에서 구매 내역을 찾지 못했어요. 구매하지 않은 상품은 구매 버튼으로 남아요.';
}
