import type { SyncSnapshot } from './progress-sync';

export type BackupUIAction = {
  kind: 'restore' | 'resolve' | 'enable' | 'retry' | 'disable';
  title: string;
  disabled: boolean;
  backupID?: string;
  importGuest?: boolean;
  generation?: number;
  resolution?: { choice: 'cloud' | 'local'; token: string; backupID?: string };
  confirmation?: { title: string; message: string; confirm: string };
};

export type ICloudBackupUI = { notice?: string; actions: BackupUIAction[] };

export function buildICloudBackupUI(
  state: SyncSnapshot,
  formatDateTime: (value: string, index: number) => string,
): ICloudBackupUI {
  const disabled = state.busy;
  const retry: BackupUIAction = { kind: 'retry', title: '다시 확인 / 백업 재시도', disabled };
  if (!state.ready || state.status !== 'available') return { actions: [retry] };

  const conflict = state.conflict;
  if (conflict && (state.enabled || !state.hasProfile)) {
    const selectable = conflict.backups.length === 1
      ? conflict.backups
      : conflict.backups.every(candidate => candidate.legacy) ? conflict.backups : [];
    const cloud = selectable.map((candidate, index): BackupUIAction => ({
      kind: 'resolve',
      title: selectable.length === 1 ? '클라우드 기록 이어받기' : `클라우드 기록 이어받기 · ${formatDateTime(candidate.createdAt, index)}`,
      disabled,
      resolution: { choice: 'cloud', token: conflict.token, backupID: selectable.length === 1 ? undefined : candidate.id },
      confirmation: {
        title: '클라우드 기록을 이어받을까요?',
        message: state.hasProfile
          ? '이 기기에서 아직 동기화되지 않은 학습 기록은 이어받은 클라우드 기록에 포함되지 않아요. 두 기록은 합쳐지지 않습니다.'
          : 'iCloud 백업을 켜고 클라우드 기록을 사용합니다. 이 기기의 게스트 학습 기록은 포함되지 않으며, 두 기록은 합쳐지지 않아요.',
        confirm: '클라우드 기록 이어받기',
      },
    }));
    const local: BackupUIAction = {
      kind: 'resolve', title: '이 기기 기록으로 백업 교체', disabled,
      resolution: { choice: 'local', token: conflict.token, backupID: selectable.length > 1 ? selectable[0]!.id : undefined },
      confirmation: {
        title: '이 기기 기록으로 교체할까요?',
        message: state.hasProfile
          ? '클라우드에만 있는 학습 기록은 새 백업에 포함되지 않아요. 두 기록은 합쳐지지 않습니다.'
          : 'iCloud 백업을 켜고 이 기기의 게스트 기록과 설정을 가져와 새 백업으로 교체합니다. 클라우드에만 있는 기록은 포함되지 않으며, 두 기록은 합쳐지지 않아요.',
        confirm: '이 기기 기록으로 교체',
      },
    };
    const canUseLocal = selectable.length > 0 || conflict.backups.length === 0;
    const notice = conflict.backups.length === 0
      ? '클라우드 백업이 비어 있어요. 이 기기 기록으로 새 백업을 만들 수 있습니다.'
      : selectable.length
        ? '두 곳의 학습 기록이 모두 변경되었어요. 기록은 자동으로 합쳐지지 않으므로 사용할 기록을 선택해 주세요.'
        : '백업 상태가 변경되었어요. 다시 확인한 뒤 기록을 선택해 주세요.';
    const actions = selectable.length || canUseLocal ? [...cloud, ...(canUseLocal ? [local] : []), retry] : [retry];
    if (state.enabled) actions.push({ kind: 'disable', title: '이 기기에서 백업 끄기', generation: state.generation, disabled });
    return { notice, actions };
  }

  const actions: BackupUIAction[] = [];
  let notice: string | undefined;
  if (!state.enabled) {
    if (state.hasProfile) {
      actions.push({ kind: 'enable', title: '이 기록의 백업 다시 켜기', importGuest: false, generation: state.generation, disabled });
    } else if (state.backups.length === 1) {
      const candidate = state.backups[0]!;
      actions.push({ kind: 'restore', title: `백업 복구 · ${formatDateTime(candidate.createdAt, 0)}`, backupID: candidate.id, disabled });
    } else if (state.backups.length > 1 && state.backups.every(candidate => candidate.legacy)) {
      notice = '이전 방식의 백업 기록이 여러 개 있어요. 옮겨올 기록을 직접 선택해 주세요. 기록은 합쳐지지 않아요.';
      state.backups.forEach((candidate, index) => actions.push({
        kind: 'restore', title: `클라우드 기록 이어받기 · ${formatDateTime(candidate.createdAt, index)}`,
        backupID: candidate.id, disabled,
      }));
    } else if (state.backups.length > 1) {
      notice = '백업 상태를 안전하게 확인할 수 없어요. 다시 확인한 뒤 복구해 주세요.';
    } else {
      actions.push(
        { kind: 'enable', title: '이 기기의 기록을 포함해 백업 켜기', importGuest: true, generation: state.generation, disabled },
        { kind: 'enable', title: '기존 기록과 별도로 백업 시작', importGuest: false, generation: state.generation, disabled },
      );
    }
  }
  if (state.cleanupPending) notice = '새 백업은 저장되었지만 이전 백업 정리가 끝나지 않았어요. 다시 시도하고, 다른 기기에서도 최신 앱을 사용해 주세요.';
  actions.push(retry);
  if (state.enabled) actions.push({ kind: 'disable', title: '이 기기에서 백업 끄기', generation: state.generation, disabled });
  return { notice, actions };
}
