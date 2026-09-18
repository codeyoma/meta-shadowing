import type { SyncSnapshot } from './progress-sync';

const errors: Record<string, string> = {
  'progress-cloud-unavailable': '이 기기에서는 iCloud 동기화를 사용할 수 없어요. iCloud 설정과 앱 구성을 확인해 주세요.',
  'progress-cloud-quota': 'iCloud 저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.',
  'progress-cloud-permission': 'iCloud 접근이 허용되지 않았어요. 기기의 iCloud 설정을 확인해 주세요.',
  'progress-cloud-corrupt': '클라우드 기록을 읽을 수 없어요. 이 기기의 학습 기록은 그대로 유지됩니다.',
  'progress-cloud-tooLarge': '학습 기록이 지원 용량을 넘었어요. 이 기기의 기록은 유지됩니다.',
  'progress-cloud-storage': '기록을 저장하지 못했어요. 기기 저장 공간을 확인한 뒤 다시 시도해 주세요.',
  'progress-cloud-accountChanged': 'iCloud 계정이 변경되었어요. 다시 확인해 주세요.',
  'progress-cloud-updateRequired': '다른 기기에서 더 새로운 형식으로 동기화했어요. 앱을 업데이트해 주세요.',
};

/** Quiet settings presentation; automatic synchronization never offers a winner. */
export function buildICloudSyncUI(state: SyncSnapshot) {
  const quiet = !state.error || ['progress-cloud-offline', 'progress-cloud-busy', 'progress-cloud-conflict'].includes(state.error);
  return { title: '자동 동기화', refreshLabel: '지금 동기화', refreshDisabled: state.busy,
    error: quiet ? null : errors[state.error!] ?? errors['progress-cloud-storage']!, pending: state.pending };
}
