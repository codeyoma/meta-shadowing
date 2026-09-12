import { useSyncExternalStore } from 'react';
import { Alert, View } from 'react-native';
import { ActionButton, Card, Label, usePalette } from './ui';
import { getProgressSync } from '@/native/progress-sync';
import { buildICloudBackupUI, type BackupUIAction } from '@/core/icloud-backup-ui';

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
  const c = usePalette();
  const sync = getProgressSync();
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const ui = buildICloudBackupUI(state, value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '저장 시각 확인 불가' : new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(date);
  });
  function perform(action: BackupUIAction) {
    if (action.disabled) return;
    if (action.kind === 'restore') { void sync.restore(action.backupID!); return; }
    if (action.kind === 'enable') { void sync.enable(action.importGuest!, action.generation); return; }
    if (action.kind === 'retry') { void sync.retry(); return; }
    if (action.kind === 'disable') { sync.disable(action.generation); return; }
    const resolution = action.resolution!;
    const run = () => { void sync.resolveConflict(resolution.choice, resolution.token, resolution.backupID); };
    Alert.alert(action.confirmation!.title, action.confirmation!.message, [
      { text: '취소', style: 'cancel' },
      { text: action.confirmation!.confirm, style: 'destructive', onPress: run },
    ]);
  }
  return <Card>
    <Label size={19} weight="700">iCloud 백업</Label>
    <Label muted>{state.enabled ? (state.pending ? '이 기기에 저장됨 · 백업 대기 중' : 'iCloud 백업 사용 중') : '학습 기록은 이 기기에 저장됩니다. 백업은 선택해서 사용할 수 있어요.'}</Label>
    {state.status === 'no-account' && <Label>기기의 설정에서 iCloud에 로그인한 뒤 다시 확인해 주세요.</Label>}
    {state.status === 'unavailable' && <Label>{errors['progress-cloud-unavailable']}</Label>}
    {state.status === 'unknown' && <Label>iCloud 계정을 확인하지 못했어요. 저장된 기록으로 계속 학습할 수 있어요.</Label>}
    {state.error && <Label color={c.red}>{errors[state.error] ?? errors['progress-cloud-storage']}</Label>}
    {state.busy && <Label muted>iCloud 백업 확인 중…</Label>}
    {ui.notice && <Label muted>{ui.notice}</Label>}
    <View style={{ gap: 12 }}>
      {ui.actions.map((action, index) => <ActionButton
        key={`${action.kind}:${action.backupID ?? action.resolution?.backupID ?? ''}:${index}`}
        title={action.title}
        secondary={action.kind !== 'enable' && action.kind !== 'restore'}
        disabled={action.disabled}
        onPress={() => perform(action)} />)}
    </View>
    <Label size={13} muted>백업을 꺼도 기록은 삭제되지 않아요. 아직 전송되지 않은 기록은 앱을 삭제하면 복구할 수 없어요.</Label>
  </Card>;
}
