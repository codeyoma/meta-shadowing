import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { books } from '@/native/catalog';
import { installMaterials } from '@/native/package-availability';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { HostedLibraryBook } from './hosted-library-book';
import { OwnedLibraryBookCard } from './owned-library-book-card';
import { usePackageMaterials } from './use-package-materials';

export function LibraryBook({ book, editing }: { book: typeof books[number]; editing: boolean }) {
  return book.delivery === 'appleHosted'
    ? <HostedLibraryBook book={book} editing={editing} />
    : <BundledLibraryBook book={book} editing={editing} />;
}

function BundledLibraryBook({ book, editing }: {
  book: Extract<typeof books[number], { delivery: 'bundled' | 'localVideo' }>; editing: boolean;
}) {
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [progress, setProgress] = useState<number | null>(null);
  const materials = usePackageMaterials(book, editing, () => {});
  async function install() {
    setProgress(0);
    try {
      await installMaterials(book, setProgress);
    }
    catch { Alert.alert('레슨을 설치하지 못했어요', '저장 공간과 연결을 확인하고 다시 시도해 주세요. 설치가 끝나기 전에는 학습을 시작할 수 없어요.'); }
    finally { setProgress(null); }
  }
  const busy = materials.changing || progress !== null;
  return <OwnedLibraryBookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
      completed={overview?.completed ?? null} editing={editing} installed={materials.storage?.installed ?? false} busy={busy}
      refreshing={materials.reading}
      download={progress === null ? null : { progress: progress / Math.max(1, book.sentences), label: '설치 중…', canCancel: false }}
      storage={materials.storage} storageFailed={materials.readFailed}
      onRetryStorage={() => { void materials.refresh(); }}
      onStudy={() => { if (select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson'); }}
      onDownload={() => { void install(); }} onRemove={() => { void materials.remove(); }} />
}
