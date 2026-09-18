import { useRef, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Label } from './ui';
import { getProgressSync } from '@/native/progress-sync';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { enableAutomaticBackup, refreshProgress } from '@/core/enable-backup';
import { buildICloudSyncUI } from '@/core/icloud-backup-ui';

export function ICloudBackup() {
  const c = useSettingsColors();
  const sync = getProgressSync();
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const ui = buildICloudSyncUI(state);
  const acting = useRef(false);
  const chooseGuestImport = () => new Promise<boolean | null>(resolve => {
    Alert.alert('이 기기의 기록을 포함할까요?',
      '현재 게스트 학습 기록과 설정을 이 iCloud 계정에 포함할지 선택해 주세요. 별도로 시작해도 게스트 기록은 이 기기에 보관됩니다.', [
        { text: '취소', style: 'cancel', onPress: () => resolve(null) },
        { text: '기존 기록과 별도로 시작', onPress: () => resolve(false) },
        { text: '이 기기의 기록 포함', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
  });
  async function run(enable: boolean) {
    if (acting.current || sync.getSnapshot().busy) return;
    acting.current = true;
    try {
      await sync.refreshAccount(false);
      const latest = sync.getSnapshot();
      if (!latest.ready || latest.status !== 'available') {
        const error = buildICloudSyncUI(latest).error;
        if (latest.status === 'no-account') Alert.alert('iCloud 동기화', '기기의 설정에서 iCloud에 로그인해 주세요.');
        else if (error) Alert.alert('iCloud 동기화', error);
        return;
      }
      if (enable) await enableAutomaticBackup(sync, chooseGuestImport);
      else await refreshProgress(sync, chooseGuestImport);
      const error = buildICloudSyncUI(sync.getSnapshot()).error;
      if (error) Alert.alert('iCloud 동기화', error);
    } catch {
      Alert.alert('iCloud 동기화', '기록을 확인하지 못했어요. 이 기기의 기록은 유지됩니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.');
    } finally { acting.current = false; }
  }
  return <View style={{ gap: 24 }}>
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      <Label size={15} color={c.secondary}>자동 동기화를 켜면 같은 iCloud 계정의 기기에서 학습 기록과 설정을 이어서 사용할 수 있어요. 최근 학습 위치를 선택하고, 누적 경험치와 완료 기록은 함께 보존합니다.</Label>
      <Label size={13} color={c.secondary}>앱 실행·복귀, 인터넷 재연결, 앱 사용 중 주기적으로 동기화합니다. 오프라인 기록은 먼저 기기에 저장해요.</Label>
      <Label size={13} color={c.secondary}>동기화할 모든 기기의 앱을 최신 버전으로 업데이트해 주세요.</Label>
      <Label size={13} color={c.secondary}>자동 동기화를 꺼도 저장된 기록은 삭제되지 않아요. 동기화되지 않은 기록은 앱을 삭제하면 복구할 수 없어요.</Label>
      {state.busy && <Label size={14} color={c.secondary}>iCloud 동기화 중…</Label>}
      {!state.busy && ui.pending && <Label size={14} color={c.secondary}>동기화를 기다리는 기록이 있어요.</Label>}
      {ui.error && <Label size={14} color="#d70015">{ui.error}</Label>}
    </View>
    <SettingsSection paddingVertical={8}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 44 }}>
        <View style={{ flex: 1 }}><Label color={c.text}>{ui.title}</Label></View>
        <Switch accessibilityLabel={ui.title} value={state.enabled} disabled={state.busy} style={{ alignSelf: 'center' }}
          onValueChange={value => { if (value) void run(true); else sync.disable(state.generation); }} trackColor={{ true: '#34c759' }} />
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />
      <Pressable accessibilityRole="button" accessibilityLabel={ui.refreshLabel} accessibilityState={{ disabled: ui.refreshDisabled }}
        disabled={ui.refreshDisabled} onPress={() => void run(false)} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed || ui.refreshDisabled ? 0.5 : 1 })}>
        <Label color="#007aff" align="center">{ui.refreshLabel}</Label>
      </Pressable>
    </SettingsSection>
  </View>;
}
