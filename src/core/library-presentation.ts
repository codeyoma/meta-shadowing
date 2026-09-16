import type { StoreSnapshot } from '../../modules/package-store/src/PackageStore.types';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { purchasePresentation } from './package-purchase';

export function sampleLibraryEntry() {
  return { section: 'owned' as const, badge: '샘플' as const, receiptOwned: false };
}

/** Full 16-stage curriculum estimate, not an XP award or a claim that all stages are playable. */
export function minimumBookXp(sentences: number): number | null {
  const xp = sentences * 3 /* base cycles */ * 3 /* required runs */ * 16 /* stages */;
  return Number.isSafeInteger(sentences) && sentences > 0 && Number.isSafeInteger(xp) ? xp : null;
}

export function paidLibraryEntry(snapshot: StoreSnapshot) {
  const purchase = purchasePresentation(snapshot);
  const owned = snapshot.ownership === 'owned';
  const uncertain = snapshot.ownership === 'unknown' || snapshot.entitlementIssue !== 'none'
    || snapshot.outcome === 'unverified';
  const failed = snapshot.catalogIssue === 'failed' || snapshot.outcome === 'failed';
  return {
    section: owned ? 'owned' as const : 'store' as const,
    title: snapshot.product?.title ?? purchase.title,
    price: snapshot.product?.price ?? '가격 확인 불가',
    canPurchase: purchase.canPurchase,
    status: owned ? '학습 자료 준비 중' : purchase.status,
    canStudy: false,
    canDownload: false,
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

/** Keep the delivery phase and measured installation view in one refresh boundary. */
export async function refreshHostedMaterial(refreshDelivery: () => Promise<void>, refreshStorage: () => Promise<void>) {
  await Promise.all([refreshDelivery(), refreshStorage()]);
}

export function canRetryStorageRead(failed: boolean, busy: boolean) {
  return failed && !busy;
}
