import { useCallback, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { books } from '@/native/catalog';
import { cancelHostedSample, downloadHostedSample, hostedStatus } from '@/native/hosted-package';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { OwnedLibraryBookCard } from './owned-library-book-card';
import { usePackageMaterials } from './use-package-materials';
import { hostedDownloadPresentation, refreshHostedMaterial } from '@/core/library-presentation';
import { observeHostedMaterial } from '@/core/hosted-material-observer';
import { isFreeDuo, freeDuoActions } from '@/native/free-duo';
import { isPaidDuo, paidDuoActions, authorizePackage, mayUsePackage } from '@/native/paid-package';

const sampleActions = { status: hostedStatus, start: downloadHostedSample, cancel: cancelHostedSample };

export function HostedLibraryBook({ book, editing, accessBlocked = false, title }: { book: typeof books[number]; editing: boolean; accessBlocked?: boolean; title?: string }) {
  const actions = isPaidDuo(book) ? paidDuoActions : isFreeDuo(book) ? freeDuoActions : sampleActions;
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancelPending = useRef(false);
  const materials = usePackageMaterials(book, editing, () => { setStatus({ phase: 'failed', progress: 0 }); });
  const observer = useRef<ReturnType<typeof observeHostedMaterial> | null>(null);
  const refresh = useCallback(async () => { await observer.current?.refresh(); }, []);
  const refreshStorage = materials.refresh;
  useFocusEffect(useCallback(() => {
    const current = observeHostedMaterial({ readDelivery: actions.status, publish: setStatus, refreshStorage,
      schedule: poll => { const timer = setTimeout(() => { void poll(); }, 250); return () => clearTimeout(timer); } });
    observer.current = current;
    void current.refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void current.refresh(); });
    return () => { current.dispose(); observer.current = null; subscription.remove(); };
  }, [refreshStorage, actions]));
  const busy = !!status && ['downloading', 'installing', 'cancelling'].includes(status.phase);
  async function download() {
    if (accessBlocked) return;
    setStatus({ phase: 'downloading', progress: 0 });
    try { const pending = actions.start(); void refresh(); await pending; }
    catch (error) {
      const current = await actions.status().catch(() => null);
      if (isPaidDuo(book)) {
        const message = String(error);
        Alert.alert('다운로드하지 못했어요', message.includes('unauthorized') ? '구매 내역을 다시 확인하거나 복원해 주세요.'
          : message.includes('storageFull') ? '저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.'
          : message.includes('damagedFiles') ? '자료 검증에 실패했어요. 다시 다운로드해 주세요.'
          : message.includes('writeDenied') ? '자료를 저장할 수 없어요. 앱을 다시 열고 시도해 주세요.'
          : '연결과 배포 설정을 확인하고 다시 시도해 주세요. 구매 내역과 학습 기록은 유지돼요.');
        return;
      }
      if (current?.phase !== 'cancelled') Alert.alert('다운로드하지 못했어요', isFreeDuo(book)
        ? '내부 TestFlight에서는 DUO 테스트 자산 업로드가, Xcode 실행에서는 Background Assets 테스트 서버 설정이 필요해요. 설정과 연결·저장 공간을 확인해 주세요. 검증 전에는 학습할 수 없어요.'
        : '연결과 저장 공간을 확인하고 다시 다운로드해 주세요. 검증을 마치기 전에는 학습을 시작할 수 없어요.');
    } finally { await refreshHostedMaterial(refresh, async () => { await materials.refresh(); }); }
  }
  async function cancel() {
    if (cancelPending.current || status?.phase !== 'downloading') return;
    cancelPending.current = true;
    setCancelling(true);
    try { await actions.cancel(); await refresh(); }
    catch { Alert.alert('취소하지 못했어요', '다시 시도해 주세요.'); }
    finally { cancelPending.current = false; setCancelling(false); }
  }
  const phase = status?.phase;
  const downloadView = hostedDownloadPresentation(cancelling
    ? { phase: 'cancelling', progress: status?.progress ?? 0 } : status);
  return <OwnedLibraryBookCard title={title ?? book.title} sentences={book.sentences} chapters={book.chapters} accessBlocked={accessBlocked}
    completed={overview?.completed ?? null} editing={editing} installed={phase === 'ready'}
    busy={busy || cancelling || materials.reading || materials.removing} download={downloadView}
    storage={materials.storage} storageFailed={materials.readFailed}
    onRetryStorage={() => { void materials.refresh(); }}
    onStudy={() => { void (async () => { if (!accessBlocked && await authorizePackage(book) && mayUsePackage(book)
      && select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson'); })(); }}
    onDownload={() => { void download(); }} onCancel={() => { void cancel(); }}
    onRemove={() => { void materials.remove(); }} />;
}
