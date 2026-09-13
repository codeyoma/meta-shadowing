import type { SyncSnapshot } from './progress-sync';

export type BackupRecoveryAction = {
  title: string;
  resolution: { choice: 'cloud' | 'local'; token: string; backupID?: string };
  confirmation: { title: string; message: string; confirm: string };
};
export type BackupRecoveryUI = {
  title: string;
  message: string;
  actions: BackupRecoveryAction[];
  generation: number;
  token?: string;
  enable: boolean;
  confirmDirectly: boolean;
};

/** The transient recovery/confirmation model rendered by ICloudBackup. */
export function buildICloudBackupUI(
  state: SyncSnapshot,
  formatDateTime: (value: string, index: number) => string,
  options: { enable: boolean; allowLocal: boolean },
): BackupRecoveryUI {
  const ui: BackupRecoveryUI = { title: 'iCloud 백업', message: '내려받을 백업이 없어요.',
    actions: [], generation: state.generation, enable: options.enable || state.enabled, confirmDirectly: false };
  if (!state.ready || state.status !== 'available' || state.busy) {
    return { ...ui, message: '백업 상태를 확인한 뒤 다시 시도해 주세요.' };
  }
  const conflict = state.conflict;
  if (!conflict) return ui;
  ui.token = conflict.token;
  const candidates = conflict.backups;
  if (candidates.length !== 1 && !candidates.every(candidate => candidate.legacy)) {
    return { ...ui, title: '백업 확인 필요', message: '백업 상태를 확인하지 못했어요. 잠시 뒤 다시 내려받기를 눌러 주세요.' };
  }
  const enabledNotice = ui.enable && !state.enabled ? '\n자동 백업도 켜집니다.' : '';
  const actions: BackupRecoveryAction[] = candidates.map((candidate, index) => {
    const savedAt = Number.isNaN(Date.parse(candidate.createdAt)) ? '날짜 확인 불가' : formatDateTime(candidate.createdAt, index);
    return {
      title: `iCloud 기록 사용 · ${savedAt}`,
      resolution: { choice: 'cloud', token: conflict.token, backupID: candidates.length === 1 ? undefined : candidate.id },
      confirmation: { title: 'iCloud 기록을 내려받을까요?',
        message: `백업 시각: ${savedAt}\n현재 기기 기록을 iCloud 기록으로 교체합니다. 두 기록은 합쳐지지 않아요.${enabledNotice}`,
        confirm: '내려받기' },
    };
  });
  if (options.allowLocal) actions.push({
    title: '이 기기 기록 사용',
    resolution: { choice: 'local', token: conflict.token, backupID: candidates.length > 1 ? candidates[0]!.id : undefined },
    confirmation: { title: '이 기기의 기록으로 백업할까요?',
      message: (state.hasProfile ? '' : '이 기기의 게스트 기록과 설정을 가져옵니다.\n')
        + `iCloud에만 있는 기록은 새 백업에 포함되지 않아요. 두 기록은 합쳐지지 않습니다.${enabledNotice}`,
      confirm: '이 기기 기록 사용' },
  });
  if (!actions.length) return ui;
  return { ...ui, title: '사용할 기록 선택', message: '기록은 자동으로 합쳐지지 않아요.',
    token: conflict.token, actions, confirmDirectly: !options.allowLocal && actions.length === 1 };
}
