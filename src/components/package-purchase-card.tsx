import { Alert, View } from 'react-native';
import { useSyncExternalStore } from 'react';
import { packagePurchases } from '@/native/purchases';
import { purchasePresentation } from '@/core/package-purchase';
import { ActionButton, Card, Icon, Label, usePalette } from './ui';

export function PackagePurchaseCard() {
  const c = usePalette();
  const snapshot = useSyncExternalStore(packagePurchases.subscribe, packagePurchases.getSnapshot);
  const bridgeError = useSyncExternalStore(packagePurchases.subscribe, packagePurchases.hasBridgeError);
  const view = purchasePresentation(snapshot);
  const issue = snapshot.entitlementIssue !== 'none' || snapshot.outcome === 'unverified';
  const failed = snapshot.catalogIssue === 'failed' || snapshot.outcome === 'failed' || bridgeError;
  const unavailable = !packagePurchases.available || snapshot.catalogIssue === 'unavailable';
  return <Card>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <Icon name="book.closed" size={28} />
      <View style={{ flex: 1, gap: 3 }}>
        <Label size={20} display color={c.heading}>{view.title}</Label>
        <Label size={14} weight="700">{snapshot.busy ? 'App Store 확인 중…' : view.status}</Label>
      </View>
    </View>
    <Label size={14} muted>{view.detail}</Label>
    {unavailable && <Label size={14} muted>{packagePurchases.available
      ? 'App Store에서 상품을 찾지 못했어요. 상품 설정과 판매 지역을 확인한 뒤 다시 시도해 주세요.'
      : '구매 기능이 포함된 iPhone 앱으로 업데이트해 주세요.'}</Label>}
    {issue && <Label size={14} muted>구매 내역을 검증하지 못했어요. 연결을 확인하고 구매 복원을 시도해 주세요. 이전에 확인한 구매가 취소되었다는 뜻은 아니에요.</Label>}
    {failed && !issue && <Label size={14} muted>App Store에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</Label>}
    {snapshot.outcome === 'cancelled' && <Label size={14} muted>구매를 취소했어요. 새로 결제되지 않았어요.</Label>}
    {snapshot.outcome === 'pending' && <Label size={14} muted>승인이 완료되면 구매 내역이 자동으로 갱신돼요. 승인이 거절되었거나 만료되었다면 아래에서 승인 상태를 다시 확인해 주세요.</Label>}
    {snapshot.outcome === 'restored' && snapshot.ownership === 'notOwned' && <Label size={14} muted>현재 App Store 계정에서 이 패키지의 구매 내역을 찾지 못했어요.</Label>}
    {snapshot.ownership !== 'owned' && <ActionButton title={snapshot.product ? `${snapshot.product.price} 구매하기` : '구매 불가'}
      disabled={!view.canPurchase || bridgeError} onPress={() => Alert.alert('다운로드 준비 중',
        '현재는 구매 및 복원 테스트만 가능하며, 패키지를 다운로드하거나 학습할 수 없어요. 계속할까요?', [
          { text: '취소', style: 'cancel' }, { text: '계속', onPress: () => { void packagePurchases.purchase(); } },
        ])} />}
    {(failed || unavailable || issue || snapshot.ownership === 'unknown') && packagePurchases.available &&
      <ActionButton title="다시 확인" secondary disabled={snapshot.busy} onPress={() => { void packagePurchases.refresh(); }} />}
    <ActionButton title={snapshot.outcome === 'pending' ? '승인 상태 다시 확인 · 구매 복원' : '구매 복원'} icon="arrow.clockwise" secondary disabled={snapshot.busy || !packagePurchases.available}
      onPress={() => { void packagePurchases.restore(); }} />
  </Card>;
}
