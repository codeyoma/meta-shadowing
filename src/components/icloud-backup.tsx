import { useRef, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Label } from './ui';
import { getProgressSync } from '@/native/progress-sync';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { enableAutomaticBackup } from '@/core/enable-backup';
import { buildICloudBackupUI, type BackupRecoveryAction } from '@/core/icloud-backup-ui';

const errors: Record<string, string> = {
  'progress-cloud-unavailable': '이 기기에서는 iCloud 백업을 사용할 수 없어요. iCloud 설정과 앱 구성을 확인해 주세요.',
  'progress-cloud-offline': 'iCloud에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  'progress-cloud-quota': 'iCloud 저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.',
  'progress-cloud-permission': 'iCloud 접근이 허용되지 않았어요. 기기의 iCloud 설정을 확인해 주세요.',
  'progress-cloud-conflict': '두 곳의 학습 기록이 모두 변경되었어요. 아래에서 사용할 기록을 선택해 주세요.',
  'progress-cloud-corrupt': '이 백업을 읽을 수 없어요. 이 기기의 기록은 그대로 유지됩니다.',
  'progress-cloud-tooLarge': '학습 백업이 지원 용량을 넘었어요. 이 기기의 기록은 유지됩니다.',
  'progress-cloud-storage': '기록을 저장하지 못했어요. 기기 저장 공간을 확인한 뒤 다시 시도해 주세요.',
  'progress-cloud-accountChanged': 'iCloud 계정이 변경되었어요. 다시 확인해 주세요.',
  'progress-cloud-busy': 'iCloud 작업이 진행 중이에요. 잠시 뒤 다시 시도해 주세요.',
  'restore-required': '기존 iCloud 백업이 있어요. 아래에서 복구할 기록을 선택해 주세요.',
  'local-profile-exists': '이 계정의 기록을 이미 사용 중이에요. 새 학습 기록을 보호하기 위해 다시 덮어쓰지 않아요.',
};
export function ICloudBackup() {
  const c = useSettingsColors();
  const sync = getProgressSync();
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const acting = useRef(false);
  function reportError() {
    const latest = sync.getSnapshot();
    Alert.alert('iCloud 백업', errors[latest.error ?? ''] ?? (latest.status === 'no-account'
      ? '기기의 설정에서 iCloud에 로그인해 주세요.' : errors['progress-cloud-unavailable']));
  }
  function chooseRecords(enable: boolean, allowLocal = enable) {
    const ui = buildICloudBackupUI(sync.getSnapshot(), value => new Date(value).toLocaleString('ko-KR'), { enable, allowLocal });
    const cancel = () => { if (ui.token) sync.cancelDownload(ui.token); };
    if (!ui.actions.length) {
      Alert.alert(ui.title, ui.message, [{ text: '확인', onPress: cancel }], { cancelable: true, onDismiss: cancel });
      return;
    }
    function confirm(action: BackupRecoveryAction) {
      const { choice, token, backupID } = action.resolution;
      const cloud = choice === 'cloud';
      Alert.alert(action.confirmation.title, action.confirmation.message, [
          { text: '취소', style: 'cancel', onPress: cancel },
          { text: action.confirmation.confirm, style: 'destructive', onPress: () => {
            void (async () => {
              await sync.resolveConflict(choice, token, backupID, ui.enable);
              const result = sync.getSnapshot();
              if (result.generation !== ui.generation) return;
              if (result.conflict) Alert.alert('기록이 변경되었어요', '최신 기록을 다시 확인한 뒤 내려받기를 눌러 주세요.');
              else if (result.error) reportError();
              else Alert.alert('iCloud 백업', cloud ? '기록을 내려받았어요.' : '이 기기의 기록을 백업했어요.');
            })();
          } },
        ]);
    }
    if (ui.confirmDirectly) { confirm(ui.actions[0]!); return; }
    Alert.alert(ui.title, ui.message, [
      { text: '취소', style: 'cancel', onPress: cancel },
      ...ui.actions.map(action => ({ text: action.title, onPress: () => confirm(action) })),
    ]);
  }
  async function run(enable: boolean) {
    if (acting.current || sync.getSnapshot().busy) return;
    acting.current = true;
    try {
      if (enable) {
        await sync.refreshAccount(false);
        const latest = sync.getSnapshot();
        if (!latest.ready || latest.status !== 'available') { reportError(); return; }
        if (latest.hasProfile || !latest.backups.length) {
          await enableAutomaticBackup(sync, () => new Promise(resolve => {
            Alert.alert('이 기기의 기록을 포함할까요?',
              '현재 게스트 학습 기록과 설정을 iCloud에 가져올지 선택해 주세요. 별도로 시작해도 기존 게스트 기록은 이 기기에 보관됩니다.', [
                { text: '취소', style: 'cancel', onPress: () => resolve(null) },
                { text: '기존 기록과 별도로 시작', onPress: () => resolve(false) },
                { text: '이 기기의 기록 포함', onPress: () => resolve(true) },
              ], { cancelable: true, onDismiss: () => resolve(null) });
          }));
          if (sync.getSnapshot().conflict) chooseRecords(true);
          else if (sync.getSnapshot().error) reportError();
          return;
        }
      }
      const hadConflict = !!sync.getSnapshot().conflict;
      await sync.prepareDownload();
      const latest = sync.getSnapshot();
      if (!latest.ready || latest.status !== 'available' || (latest.error && !latest.conflict)) { reportError(); return; }
      chooseRecords(enable, enable || (hadConflict && latest.enabled));
    } finally { acting.current = false; }
  }
  return <View style={{ gap: 24 }}>
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      <Label size={15} color={c.secondary}>학습 기록과 설정을 내 iCloud에 자동으로 백업합니다. 다른 기기나 재설치한 앱에서 내려받아 이어서 학습할 수 있어요.</Label>
      <Label size={13} color={c.secondary}>자동 백업을 꺼도 저장된 기록은 삭제되지 않아요. 아직 백업되지 않은 기록은 앱을 삭제하면 복구할 수 없어요.</Label>
      {state.busy && <Label size={14} color={c.secondary}>iCloud 확인 중…</Label>}
      {state.error && <Label size={14} color="#d70015">{state.conflict ? '사용할 기록을 확인해야 해요. 내려받기를 눌러 주세요.' : errors[state.error] ?? errors['progress-cloud-storage']}</Label>}
      {state.cleanupPending && <Label size={14} color={c.secondary}>최신 백업은 저장됐지만 이전 백업 정리가 남아 있어요. 자동 백업을 켜고 연결을 유지해 주세요.</Label>}
    </View>
    <SettingsSection paddingVertical={8}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 44 }}>
        <View style={{ flex: 1 }}><Label color={c.text}>자동 백업</Label></View>
        <Switch accessibilityLabel="자동 백업" value={state.enabled} disabled={state.busy} style={{ alignSelf: 'center' }}
          onValueChange={value => { if (value) void run(true); else sync.disable(state.generation); }} trackColor={{ true: '#34c759' }} />
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />
      <Pressable accessibilityRole="button" accessibilityLabel="내려받기" accessibilityState={{ disabled: state.busy }}
        disabled={state.busy} onPress={() => void run(false)} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed || state.busy ? 0.5 : 1 })}>
        <Label color="#007aff" align="center">내려받기</Label>
      </Pressable>
    </SettingsSection>
  </View>;
}
