import type { StoreSnapshot } from '../../modules/package-store/src/PackageStore.types';
import { purchasePresentation } from './package-purchase';

export function sampleLibraryEntry() {
  return { section: 'owned' as const, badge: '샘플' as const, receiptOwned: false };
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

export function materialActions({ installed, busy, editing, bytes, hosted = false, readFailed = false, cacheRetry = false }: {
  installed: boolean; busy: boolean; editing: boolean; cacheRetry?: boolean;
  bytes?: number; hosted?: boolean; readFailed?: boolean;
}) {
  const measured = bytes !== undefined && Number.isFinite(bytes) && bytes >= 0;
  const removable = installed || (measured && (bytes > 0 || hosted)) || cacheRetry;
  return {
    canStudy: installed && !busy && !editing && !readFailed,
    primaryAction: installed ? 'study' as const : 'download' as const,
    canDownload: !installed && !busy && !editing && !readFailed,
    canRemove: removable && !busy && editing && !readFailed,
    downloadState: busy ? 'busy' as const : installed ? 'downloaded' as const : 'download' as const,
  };
}

/** Keep the delivery phase and measured installation view in one refresh boundary. */
export async function refreshHostedMaterial(refreshDelivery: () => Promise<void>, refreshStorage: () => Promise<void>) {
  await Promise.all([refreshDelivery(), refreshStorage()]);
}

export function canRetryStorageRead(failed: boolean, busy: boolean) {
  return failed && !busy;
}
