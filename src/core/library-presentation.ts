import type { StoreSnapshot } from '../../modules/package-store/src/PackageStore.types';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { purchasePresentation } from './package-purchase';
import { paidAction } from './paid-package';

export function sampleLibraryEntry() {
  return { section: 'owned' as const, badge: '샘플' as const, receiptOwned: false };
}

/** Full 16-stage curriculum estimate, not an XP award or a claim that all stages are playable. */
export function minimumBookXp(sentences: number): number | null {
  const xp = sentences * 3 /* base cycles */ * 3 /* required runs */ * 16 /* stages */;
  return Number.isSafeInteger(sentences) && sentences > 0 && Number.isSafeInteger(xp) ? xp : null;
}

export function paidLibraryEntry(snapshot: StoreSnapshot, material?: {configured:boolean;authorized:boolean;installed:boolean}) {
  const purchase = purchasePresentation(snapshot);
  const owned = snapshot.ownership === 'owned';
  const uncertain = snapshot.ownership === 'unknown' || snapshot.entitlementIssue !== 'none'
    || snapshot.outcome === 'unverified';
  const failed = snapshot.catalogIssue === 'failed' || snapshot.outcome === 'failed';
  const action = material ? paidAction({...material, ownership:snapshot.ownership}) : 'unavailable';
  return {
    section: owned ? 'owned' as const : 'store' as const,
    title: snapshot.product?.title ?? purchase.title,
    price: snapshot.product?.price ?? '가격 확인 불가',
    canPurchase: purchase.canPurchase,
    status: owned ? action === 'study' ? '학습 준비 완료' : action === 'download' ? '다운로드 가능'
      : action === 'verify' ? '구매 내역 확인 필요' : '학습 자료 준비 중' : purchase.status,
    canStudy: action === 'study',
    canDownload: action === 'download',
    canRetry: !snapshot.busy && !owned && (!snapshot.product || uncertain || failed
      || snapshot.catalogIssue === 'unavailable'),
  };
}

export function formatMaterialBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
  if (safe < 1024) return `${safe.toLocaleString('en-US')} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  return `${(safe / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function hasLocalMaterials({ installed, bytes }: { installed: boolean; bytes?: number }) {
  return installed || (bytes !== undefined && Number.isFinite(bytes) && bytes > 0);
}

/** Exactly one control occupies the card footer, including unavailable material. */
export function materialCardAction({ installed, editing, readFailed }: {
  installed: boolean; editing: boolean; readFailed: boolean;
}) {
  return readFailed ? 'retry' : editing ? 'remove' : installed ? 'study' : 'download';
}

export function materialActions({ installed, busy, editing, bytes, readFailed = false }: {
  installed: boolean; busy: boolean; editing: boolean;
  bytes?: number; readFailed?: boolean;
}) {
  const removable = hasLocalMaterials({ installed, bytes });
  return {
    canStudy: installed && !busy && !editing && !readFailed,
    primaryAction: installed ? 'study' as const : 'download' as const,
    canDownload: !installed && !busy && !editing && !readFailed,
    canRemove: removable && !busy && editing && !readFailed,
    downloadState: busy ? 'busy' as const : installed ? 'downloaded' as const : 'download' as const,
  };
}

export function hostedDownloadPresentation(status: DeliveryStatus | null) {
  if (!status || !['downloading', 'installing', 'cancelling'].includes(status.phase)) return null;
  const progress = Number.isFinite(status.progress) ? Math.max(0, Math.min(1, status.progress)) : 0;
  return {
    progress,
    label: status.phase === 'installing' ? '검증 중…' : status.phase === 'cancelling' ? '취소 중…'
      : `${Math.floor(progress * 100)}% 다운로드 중`,
    canCancel: status.phase === 'downloading',
  };
}

export type DownloadPresentation = NonNullable<ReturnType<typeof hostedDownloadPresentation>>;

export function materialRemovalNotice(result: { cacheCleared: boolean }): string | null {
  return result.cacheCleared ? null
    : '학습 자료는 삭제했지만 Apple 임시 파일을 정리하지 못했어요. 다음 다운로드 때 다시 시도해요. 학습 기록은 유지돼요.';
}

/** Cancellation is a successful user decision, not a download failure alert. */
export function hostedDownloadError(error: unknown, status: DeliveryStatus | null, kind: 'paid' | 'free' | 'sample'): string | null {
  const message = String(error);
  if (status?.phase === 'cancelled' || message.includes('package-delivery-cancelled')) return null;
  if (message.includes('incompatibleVersion')) return '같은 버전의 자료 구성이 달라요. 학습 기록은 유지돼요. 호환되는 앱·자료 버전으로 업데이트해 주세요.';
  if (kind === 'paid') {
    return message.includes('unauthorized') ? '구매 내역을 다시 확인하거나 복원해 주세요.'
      : message.includes('storageFull') ? '저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.'
      : message.includes('damagedFiles') ? '자료 검증에 실패했어요. 다시 다운로드해 주세요.'
      : message.includes('writeDenied') ? '자료를 저장할 수 없어요. 앱을 다시 열고 시도해 주세요.'
      : '연결과 배포 설정을 확인하고 다시 시도해 주세요. 구매 내역과 학습 기록은 유지돼요.';
  }
  return kind === 'free'
    ? '내부 TestFlight에서는 DUO 테스트 자산 업로드가, Xcode 실행에서는 Background Assets 테스트 서버 설정이 필요해요. 설정과 연결·저장 공간을 확인해 주세요. 검증 전에는 학습할 수 없어요.'
    : '연결과 저장 공간을 확인하고 다시 다운로드해 주세요. 검증을 마치기 전에는 학습을 시작할 수 없어요.';
}

/** Keep the delivery phase and measured installation view in one refresh boundary. */
export async function refreshHostedMaterial(refreshDelivery: () => Promise<void>, refreshStorage: () => Promise<void>) {
  await Promise.all([refreshDelivery(), refreshStorage()]);
}

export function canRetryStorageRead(failed: boolean, busy: boolean) {
  return failed && !busy;
}
