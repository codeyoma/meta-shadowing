import type { SyncSnapshot } from './progress-sync';

export type ProgressDeletionKind = 'local' | 'cloud';
export type ProgressDeletionResult = 'cancelled' | 'stale' | 'blocked' | 'pending' | 'completed' | 'failed';

export interface ProgressDeletionPort {
  getSnapshot(): SyncSnapshot;
  removeLocal(generation?: number): Promise<void>;
  deleteCloud(generation?: number): Promise<void>;
  retryDeletion(): Promise<void>;
}

export function progressDeletionConfirmation(kind: ProgressDeletionKind) {
  if (kind === 'local') return {
    title: '학습 기록을 삭제할까요?',
    action: '학습 기록 삭제',
    message: '현재 프로필의 진행 상황·경험치·설정·전송 대기 기록을 이 기기에서 삭제하고, 자동 동기화를 꺼요.\n\n책·구매 내역·iCloud 기록은 유지돼요. 다시 동기화하면 iCloud 기록이 복원될 수 있어요.',
  };
  return {
    title: 'iCloud 학습 기록을 삭제할까요?',
    action: 'iCloud 학습 기록 삭제',
    message: '현재 계정의 진행 상황·경험치·설정을 이 기기와 iCloud에서 삭제하고, 자동 동기화를 꺼요. 다른 기기의 이전 기록도 다음 동기화 때 삭제돼요.\n\n책·구매 내역·다른 계정은 유지돼요. 기록 복원 방지용 초기화 표시는 남아요.\n\n오프라인이면 연결 후 처리하며, 완료 전까지 이 계정의 학습은 잠시 중단돼요.',
  };
}

function canStart(state: SyncSnapshot, kind: ProgressDeletionKind): boolean {
  if (state.busy || state.deletion || !state.learningAvailable) return false;
  if (kind === 'local') return true;
  // A routine offline identity refresh keeps the already verified account
  // profile mounted and authorized even though ready/hasProfile/status are
  // temporarily cleared. Account-change hiding instead mounts guest and
  // revokes learningAvailable; the coordinator remains final authorization.
  return state.profile !== 'guest';
}

function resultAfterAction(state: SyncSnapshot, profile: string, generation?: number): ProgressDeletionResult {
  if (state.profile !== profile) return 'stale';
  if (state.deletion) return 'pending';
  if (state.error || state.busy || !state.learningAvailable) return 'failed';
  if (generation !== undefined && state.generation === generation) return 'failed';
  return 'completed';
}

/** Captures consent scope before the native alert and rechecks it after the await. */
export async function confirmProgressDeletion(
  coordinator: ProgressDeletionPort,
  kind: ProgressDeletionKind,
  confirm: () => Promise<boolean>,
): Promise<ProgressDeletionResult> {
  const captured = coordinator.getSnapshot();
  if (!canStart(captured, kind)) return 'blocked';
  if (!await confirm()) return 'cancelled';

  const current = coordinator.getSnapshot();
  if (current.profile !== captured.profile || current.generation !== captured.generation) return 'stale';
  if (!canStart(current, kind)) return 'blocked';

  if (kind === 'local') await coordinator.removeLocal(captured.generation);
  else await coordinator.deleteCloud(captured.generation);
  return resultAfterAction(coordinator.getSnapshot(), captured.profile, captured.generation);
}

export async function retryProgressDeletion(coordinator: ProgressDeletionPort): Promise<ProgressDeletionResult> {
  const captured = coordinator.getSnapshot();
  if (!captured.deletion || captured.busy) return 'blocked';
  await coordinator.retryDeletion();
  return resultAfterAction(coordinator.getSnapshot(), captured.profile);
}

const sanitizedErrors: Record<string, string> = {
  'progress-cloud-offline': '인터넷에 연결되면 삭제를 계속할 수 있어요.',
  'progress-cloud-quota': 'iCloud 저장 공간을 확인한 뒤 다시 시도해 주세요.',
  'progress-cloud-permission': '기기의 iCloud 접근 설정을 확인한 뒤 다시 시도해 주세요.',
  'progress-cloud-accountChanged': 'iCloud 계정을 다시 확인한 뒤 삭제를 계속해 주세요.',
  'progress-cloud-updateRequired': '앱을 업데이트한 뒤 다시 시도해 주세요.',
};

export function buildProgressDeletionUI(state: SyncSnapshot) {
  const deletion = state.deletion;
  const cloudAvailable = state.profile !== 'guest';
  let pendingTitle: string | null = null;
  let pendingDetail: string | null = null;
  if (deletion?.kind === 'local') {
    pendingTitle = state.busy ? '학습 기록 삭제 중…' : '학습 기록 삭제 대기 중';
    pendingDetail = state.error
      ? sanitizedErrors[state.error] ?? '기기 저장 공간을 확인한 뒤 다시 시도해 주세요.'
      : '삭제 완료 전까지 학습이 잠시 중단돼요.';
  } else if (deletion?.kind === 'cloud') {
    pendingTitle = state.cleanupPending
      ? 'iCloud 이전 학습 기록 정리 중…'
      : state.busy ? 'iCloud 학습 기록 삭제 중…' : 'iCloud 학습 기록 삭제 대기 중';
    pendingDetail = state.error
      ? sanitizedErrors[state.error] ?? '안전하게 삭제를 마치지 못했어요. 다시 시도해 주세요.'
      : '삭제 완료 전까지 이 계정의 학습이 잠시 중단돼요.';
  }

  return {
    cloudAvailable,
    localDisabled: !canStart(state, 'local'),
    cloudDisabled: !canStart(state, 'cloud'),
    controlsDisabled: state.busy || !!deletion,
    retryVisible: !!deletion,
    retryDisabled: state.busy,
    pendingTitle,
    pendingDetail,
  };
}
