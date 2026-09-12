import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { ActionButton, Card, Label, usePalette } from './ui';
import { getProgressSync } from '@/native/progress-sync';

const errors: Record<string, string> = {
  'progress-cloud-unavailable': '이 기기에서는 iCloud 백업을 사용할 수 없어요. iCloud 설정과 앱 구성을 확인해 주세요.',
  'progress-cloud-offline': 'iCloud에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  'progress-cloud-quota': 'iCloud 저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.',
  'progress-cloud-permission': 'iCloud 접근이 허용되지 않았어요. 기기의 iCloud 설정을 확인해 주세요.',
  'progress-cloud-conflict': '다른 백업과 충돌했어요. 이 기기의 기록은 유지됩니다. 나중에 다시 확인해 주세요.',
  'progress-cloud-corrupt': '이 백업을 읽을 수 없어요. 다른 복구 시점을 선택해 주세요.',
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
  return <Card>
    <Label size={19} weight="700">iCloud 백업</Label>
    <Label muted>{state.enabled ? (state.pending ? '이 기기에 저장됨 · 백업 대기 중' : 'iCloud 백업 사용 중') : '학습 기록은 이 기기에 저장됩니다. 백업은 선택해서 사용할 수 있어요.'}</Label>
    {state.status === 'no-account' && <Label>기기의 설정에서 iCloud에 로그인한 뒤 다시 확인해 주세요.</Label>}
    {state.status === 'unavailable' && <Label>{errors['progress-cloud-unavailable']}</Label>}
    {state.status === 'unknown' && <Label>iCloud 계정을 확인하지 못했어요. 저장된 기록으로 계속 학습할 수 있어요.</Label>}
    {state.error && <Label color={c.red}>{errors[state.error] ?? errors['progress-cloud-storage']}</Label>}
    {state.busy && <Label muted>iCloud 백업 확인 중…</Label>}
    {!state.enabled && state.ready && !state.busy && <>
      {!state.hasProfile && state.backups.length > 0 && <Label muted>복구할 기록을 선택하세요. 이 기기의 기존 기록은 따로 보관됩니다.</Label>}
      {!state.hasProfile && state.backups.map((backup, index) => <ActionButton key={backup.id} secondary
        title={`백업 ${index + 1} 복구 · ${Number.isNaN(Date.parse(backup.createdAt)) ? '날짜 확인 불가' : new Date(backup.createdAt).toLocaleDateString('ko-KR')}`}
        onPress={() => { void sync.restore(backup.id); }} />)}
      {state.hasProfile ? <ActionButton title="이 기록의 백업 다시 켜기" onPress={() => { void sync.enable(false, state.generation); }} /> : state.backups.length === 0 && <>
        <ActionButton title="이 기기의 기록을 포함해 백업 켜기" onPress={() => { void sync.enable(true, state.generation); }} />
        <ActionButton title="기존 기록과 별도로 백업 시작" secondary onPress={() => { void sync.enable(false, state.generation); }} />
      </>}
    </>}
    <View style={{ gap: 12 }}>
      <ActionButton title="다시 확인 / 백업 재시도" secondary onPress={() => { void sync.retry(); }} />
      {state.enabled && <ActionButton title="이 기기에서 백업 끄기" secondary onPress={() => sync.disable(state.generation)} />}
    </View>
    <Label size={13} muted>백업을 꺼도 기록은 삭제되지 않아요. 아직 전송되지 않은 기록은 앱을 삭제하면 복구할 수 없어요.</Label>
  </Card>;
}
