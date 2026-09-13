import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { books } from '@/native/catalog';
import { installBundledPackage, isInstalled } from '@/native/package';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { ProgressTrack } from './ui';
import { HostedLibraryBook } from './hosted-library-book';
import { OwnedLibraryBookCard } from './owned-library-book-card';
import { usePackageMaterials } from './use-package-materials';

export function LibraryBook({ book, editing }: { book: typeof books[number]; editing: boolean }) {
  return book.delivery === 'appleHosted'
    ? <HostedLibraryBook book={book} editing={editing} />
    : <BundledLibraryBook book={book} editing={editing} />;
}

function BundledLibraryBook({ book, editing }: {
  book: Extract<typeof books[number], { delivery: 'bundled' }>; editing: boolean;
}) {
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const materials = usePackageMaterials(book, editing, () => { setReady(false); });
  useFocusEffect(useCallback(() => {
    let active = true;
    setChecking(true);
    isInstalled(book).then(value => { if (active) setReady(value); })
      .catch(() => { if (active) { setReady(false); Alert.alert('레슨을 확인할 수 없어요', '저장 공간을 확인하고 다시 시도해 주세요.'); } })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [book]));
  async function install() {
    setProgress(0);
    try { await installBundledPackage(book, setProgress); setReady(true); await materials.refresh(); }
    catch { setReady(false); Alert.alert('레슨을 설치하지 못했어요', '저장 공간과 연결을 확인하고 다시 시도해 주세요. 설치가 끝나기 전에는 학습을 시작할 수 없어요.'); }
    finally { setProgress(null); }
  }
  const busy = checking || materials.reading || materials.removing || progress !== null;
  return <View style={{ gap: 10 }}>
    <OwnedLibraryBookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
      completed={overview?.completed ?? null} editing={editing} installed={ready} busy={busy}
      busyLabel={materials.removing ? '삭제 중…' : checking || materials.reading ? undefined
        : progress !== null ? '설치 중 ' + progress + ' / ' + book.sentences : undefined}
      storage={materials.storage} storageFailed={materials.readFailed} cacheRetry={materials.cacheRetry} hosted={false}
      onRetryStorage={() => { void materials.refresh(); }}
      onStudy={() => { if (select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson'); }}
      onDownload={() => { void install(); }} onRemove={() => { void materials.remove(); }} />
    {progress !== null && <ProgressTrack value={progress} total={book.sentences} label="레슨 설치 진행" blue />}
  </View>;
}
