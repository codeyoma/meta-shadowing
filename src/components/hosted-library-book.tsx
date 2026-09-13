import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { books } from '@/native/catalog';
import { cancelHostedSample, downloadHostedSample, hostedStatus } from '@/native/hosted-package';
import type { DeliveryStatus } from '../../modules/package-delivery';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { OwnedLibraryBookCard } from './owned-library-book-card';
import { ProgressTrack } from './ui';
import { usePackageMaterials } from './use-package-materials';
import { refreshHostedMaterial } from '@/core/library-presentation';
import { observeHostedMaterial } from '@/core/hosted-material-observer';

export function HostedLibraryBook({ book, editing }: { book: typeof books[number]; editing: boolean }) {
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const materials = usePackageMaterials(book, editing, () => { setStatus({ phase: 'failed', progress: 0 }); });
  const observer = useRef<ReturnType<typeof observeHostedMaterial> | null>(null);
  const refresh = useCallback(async () => { await observer.current?.refresh(); }, []);
  const refreshStorage = materials.refresh;
  useFocusEffect(useCallback(() => {
    const current = observeHostedMaterial({ readDelivery: hostedStatus, publish: setStatus, refreshStorage,
      schedule: poll => { const timer = setTimeout(() => { void poll(); }, 250); return () => clearTimeout(timer); } });
    observer.current = current;
    void current.refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void current.refresh(); });
    return () => { current.dispose(); observer.current = null; subscription.remove(); };
  }, [refreshStorage]));
  const busy = !!status && ['downloading', 'installing', 'cancelling'].includes(status.phase);
  async function download() {
    setStatus({ phase: 'downloading', progress: 0 });
    try { const pending = downloadHostedSample(); void refresh(); await pending; }
    catch {
      const current = await hostedStatus().catch(() => null);
      if (current?.phase !== 'cancelled') Alert.alert('다운로드하지 못했어요', '연결과 저장 공간을 확인하고 다시 다운로드해 주세요. 검증을 마치기 전에는 학습을 시작할 수 없어요.');
    } finally { await refreshHostedMaterial(refresh, async () => { await materials.refresh(); }); }
  }
  async function cancel() {
    try { await cancelHostedSample(); await refresh(); }
    catch { Alert.alert('취소하지 못했어요', '다시 시도해 주세요.'); }
  }
  const phase = status?.phase;
  const busyLabel = materials.removing ? '삭제 중…' : materials.reading || !status ? undefined
    : phase === 'downloading' ? `${Math.floor(status.progress * 100)}% 다운로드 중`
      : phase === 'installing' ? '검증 중…' : phase === 'cancelling' ? '취소 중…'
        : phase === 'unavailable' ? '이 빌드에서는 다운로드할 수 없어요.'
          : phase === 'failed' ? '다운로드 또는 검증을 다시 시도해 주세요.' : undefined;
  return <View style={{ gap: 10 }}>
    <OwnedLibraryBookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
      completed={overview?.completed ?? null} editing={editing} installed={phase === 'ready'}
      busy={busy || materials.reading || materials.removing} busyLabel={busyLabel}
      storage={materials.storage} storageFailed={materials.readFailed} cacheRetry={materials.cacheRetry} hosted
      onRetryStorage={() => { void materials.refresh(); }}
      onStudy={() => { if (select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson'); }}
      onDownload={() => { void download(); }} onCancel={phase === 'downloading' ? () => { void cancel(); } : undefined}
      onRemove={() => { void materials.remove(); }} />
    {busy && <ProgressTrack value={status?.progress ?? 0} total={1} label="Apple 레슨 다운로드 진행" blue />}
  </View>;
}
