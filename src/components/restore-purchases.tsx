import { useRef, useState, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { packagePurchases } from '@/native/purchases';
import { restorePresentation } from '@/core/package-purchase';
import { SettingsRow } from './settings-row';

/** One explicit, app-wide restore action; never acquires content automatically. */
export function RestorePurchases() {
  const snapshot = useSyncExternalStore(packagePurchases.subscribe, packagePurchases.getSnapshot);
  const [restoring, setRestoring] = useState(false);
  const acting = useRef(false);
  async function restore() {
    if (acting.current || packagePurchases.getSnapshot().busy) return;
    if (!packagePurchases.available) { Alert.alert('구매 복원', '구매 기능이 포함된 iPhone 앱으로 업데이트해 주세요.'); return; }
    acting.current = true; setRestoring(true);
    try {
      await packagePurchases.restore();
      const message = packagePurchases.hasBridgeError()
        ? '구매 복원을 완료하지 못했어요. 앱을 다시 열고 시도해 주세요.'
        : restorePresentation(packagePurchases.getSnapshot()) ?? '구매 복원 결과를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      Alert.alert('구매 복원', message);
    } finally { acting.current = false; setRestoring(false); }
  }
  return <SettingsRow title={restoring ? '구매 복원 중…' : '구매 복원'} icon="arrow.clockwise" iconColor="#34c759"
    disabled={snapshot.busy || restoring} onPress={() => void restore()} />;
}
