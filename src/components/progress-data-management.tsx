import { useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { getProgressSync } from '@/native/progress-sync';
import {
  buildProgressDeletionUI,
  confirmProgressDeletion,
  progressDeletionConfirmation,
  retryProgressDeletion,
  type ProgressDeletionKind,
  type ProgressDeletionResult,
} from '@/core/progress-deletion-ui';
import { SettingsSection } from './settings-section';
import { useSettingsColors } from './settings-row';
import { Label } from './ui';

function confirm(kind: ProgressDeletionKind): Promise<boolean> {
  const copy = progressDeletionConfirmation(kind);
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    Alert.alert(copy.title, copy.message, [
      { text: '취소', style: 'cancel', onPress: () => finish(false) },
      { text: copy.action, style: 'destructive', onPress: () => finish(true) },
    ], { cancelable: true, onDismiss: () => finish(false) });
  });
}

function reportResult(result: ProgressDeletionResult, kind: ProgressDeletionKind) {
  if (result === 'completed') {
    Alert.alert('삭제 완료', kind === 'local'
      ? '이 기기의 학습 기록과 설정을 삭제했어요.'
      : 'iCloud 학습 기록을 삭제했어요.');
  } else if (result === 'stale') {
    Alert.alert('대상이 변경됐어요', '현재 표시된 프로필을 다시 확인한 뒤 요청해 주세요.');
  } else if (result === 'failed') {
    Alert.alert('삭제를 완료하지 못했어요', '현재 상태를 확인한 뒤 다시 시도해 주세요.');
  }
}

function DestructiveButton({ title, disabled, onPress }: { title: string; disabled: boolean; onPress(): void }) {
  const c = useSettingsColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({
      minHeight: 44, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
      borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: c.separator,
      backgroundColor: c.group, opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
    })}>
    <Label color="#d70015" weight="600" align="center">{title}</Label>
  </Pressable>;
}

export function ProgressDataManagement() {
  const c = useSettingsColors();
  const sync = getProgressSync();
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const ui = buildProgressDeletionUI(state);
  const acting = useRef(false);
  const [confirming, setConfirming] = useState(false);

  async function run(kind: ProgressDeletionKind) {
    if (acting.current) return;
    acting.current = true;
    setConfirming(true);
    try {
      const result = await confirmProgressDeletion(sync, kind, () => confirm(kind));
      reportResult(result, kind);
    } finally {
      acting.current = false;
      setConfirming(false);
    }
  }

  async function retry() {
    if (acting.current) return;
    acting.current = true;
    try {
      const kind = sync.getSnapshot().deletion?.kind ?? 'local';
      reportResult(await retryProgressDeletion(sync), kind);
    } finally { acting.current = false; }
  }

  return <View style={{ gap: 24 }}>
    <View style={{ paddingHorizontal: 16, gap: 8 }}>
      <Label size={15} color={c.secondary}>다운로드한 책과 구매 내역은 유지돼요.</Label>
    </View>

    {ui.retryVisible && <SettingsSection title="삭제 상태">
      <View accessibilityRole="summary" accessibilityLiveRegion="polite" style={{ gap: 6 }}>
        <Label color={c.text} weight="600">{ui.pendingTitle}</Label>
        <Label size={14} color={c.secondary}>{ui.pendingDetail}</Label>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="삭제 다시 시도"
        accessibilityState={{ disabled: ui.retryDisabled }} disabled={ui.retryDisabled}
        onPress={() => void retry()} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed || ui.retryDisabled ? 0.5 : 1 })}>
        <Label color="#007aff" align="center" weight="600">{state.busy ? '삭제 진행 중…' : '삭제 다시 시도'}</Label>
      </Pressable>
    </SettingsSection>}

    {!state.learningAvailable && !state.deletion && <SettingsSection title="계정 확인 중">
      <Label size={14} color={c.secondary}>계정 확인 후 삭제할 수 있어요.</Label>
    </SettingsSection>}

    <SettingsSection title="이 기기">
      <View style={{ gap: 6 }}>
        <Label color={c.text} weight="600">학습 기록 삭제</Label>
        <Label size={14} color={c.secondary}>현재 프로필의 기록과 설정을 이 기기에서만 삭제해요.</Label>
      </View>
      <DestructiveButton title="학습 기록 삭제" disabled={confirming || ui.localDisabled} onPress={() => void run('local')} />
    </SettingsSection>

    <SettingsSection title="iCloud">
      <View style={{ gap: 6 }}>
        <Label color={c.text} weight="600">iCloud 학습 기록 삭제</Label>
        <Label size={14} color={c.secondary}>이 기기와 iCloud의 기록을 삭제해요. 다른 기기에는 다음 동기화 때 적용돼요.</Label>
      </View>
      {ui.cloudAvailable
        ? <DestructiveButton title="iCloud 학습 기록 삭제" disabled={confirming || ui.cloudDisabled} onPress={() => void run('cloud')} />
        : <Label size={14} color={c.secondary}>iCloud 계정 프로필에서 사용할 수 있어요.</Label>}
    </SettingsSection>
  </View>;
}
