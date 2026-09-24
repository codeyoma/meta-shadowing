import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { books } from '@/native/catalog';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { OwnedLibraryBookCard } from './owned-library-book-card';
import { usePackageMaterials } from './use-package-materials';
import { hostedDownloadError, hostedDownloadPresentation } from '@/core/library-presentation';
import { isFreeDuo } from '@/native/free-duo';
import { isPaidDuo, authorizePackage, mayUsePackage } from '@/native/paid-package';
import { installMaterials, cancelMaterialDownload, packageAvailability } from '@/native/package-availability';

export function HostedLibraryBook({ book, editing, accessBlocked = false, title }: { book: typeof books[number]; editing: boolean; accessBlocked?: boolean; title?: string }) {
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [cancelling, setCancelling] = useState(false);
  const cancelPending = useRef(false);
  const materials = usePackageMaterials(book, editing, () => {});
  const status = materials.delivery;
  const busy = !!status && ['downloading', 'installing', 'cancelling'].includes(status.phase);
  async function download() {
    if (accessBlocked) return;
    try { await installMaterials(book, () => {}); }
    catch (error) {
      const current = packageAvailability(book).getSnapshot().delivery;
      const message = hostedDownloadError(error, current, isPaidDuo(book) ? 'paid' : isFreeDuo(book) ? 'free' : 'sample');
      if (message) Alert.alert('다운로드하지 못했어요', message);
    }
  }
  async function cancel() {
    if (cancelPending.current || status?.phase !== 'downloading') return;
    cancelPending.current = true;
    setCancelling(true);
    try { await cancelMaterialDownload(book); }
    catch { Alert.alert('취소하지 못했어요', '다시 시도해 주세요.'); }
    finally { cancelPending.current = false; setCancelling(false); }
  }
  const downloadView = hostedDownloadPresentation(cancelling
    ? { phase: 'cancelling', progress: status?.progress ?? 0 } : status);
  return <OwnedLibraryBookCard title={title ?? book.title} sentences={book.sentences} chapters={book.chapters} accessBlocked={accessBlocked}
    completed={overview?.completed ?? null} editing={editing} installed={materials.storage?.installed ?? false}
    busy={busy || cancelling || materials.changing} refreshing={materials.reading} download={downloadView}
    storage={materials.storage} storageFailed={materials.readFailed}
    onRetryStorage={() => { void materials.refresh(); }}
    onStudy={() => { void (async () => { if (!accessBlocked && await authorizePackage(book) && mayUsePackage(book)
      && select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson'); })(); }}
    onDownload={() => { void download(); }} onCancel={() => { void cancel(); }}
    onRemove={() => { void materials.remove(); }} />;
}
