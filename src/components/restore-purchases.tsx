import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { packagePurchases } from '@/native/purchases';
import { restorePresentation } from '@/core/package-purchase';
import { ActionButton, Label } from './ui';

/** One explicit, app-wide restore action; never acquires content automatically. */
export function RestorePurchases() {
  const snapshot = useSyncExternalStore(packagePurchases.subscribe, packagePurchases.getSnapshot);
  const bridgeError = useSyncExternalStore(packagePurchases.subscribe, packagePurchases.hasBridgeError);
  const [requested, setRequested] = useState(false);
  const message = requested && !snapshot.busy
    ? bridgeError ? '구매 복원을 완료하지 못했어요. 앱을 다시 열고 시도해 주세요.' : restorePresentation(snapshot)
    : null;
  return <View style={{ gap: 12 }}>
    <ActionButton title={requested && snapshot.busy ? '구매 복원 중…' : '구매 복원'} icon="arrow.clockwise" secondary
      disabled={snapshot.busy || !packagePurchases.available} onPress={() => {
        setRequested(true);
        void packagePurchases.restore();
      }} />
    {!packagePurchases.available && <Label size={14} muted>구매 기능이 포함된 iPhone 앱으로 업데이트해 주세요.</Label>}
    {snapshot.outcome === 'pending' && <Label size={14} muted>구매 승인이 거절되었거나 만료되었다면 구매 복원으로 승인 상태를 다시 확인해 주세요.</Label>}
    {message && <Label size={14} muted>{message}</Label>}
  </View>;
}
