import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { books } from '@/native/catalog';
import { installBundledPackage, isInstalled } from '@/native/package';
import { useLibrary } from './library-context';
import { useBookRecords } from './use-book-records';
import { BookCard } from './book-card';
import { ProgressTrack } from './ui';

export function LibraryBook({ book }: { book: typeof books[number] }) {
  const { select } = useLibrary();
  const { overview } = useBookRecords(book);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setChecking(true);
    isInstalled(book).then(value => { if (active) setReady(value); })
      .catch(() => { if (active) Alert.alert('레슨을 확인할 수 없어요', '저장 공간을 확인하고 다시 시도해 주세요.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [book]));
  async function install() {
    setProgress(0);
    try { await installBundledPackage(book, setProgress); setReady(true); }
    catch { Alert.alert('레슨을 설치하지 못했어요', '저장 공간과 연결을 확인하고 다시 시도해 주세요. 설치가 끝나기 전에는 학습을 시작할 수 없어요.'); }
    finally { setProgress(null); }
  }
  return <View style={{ gap: 10 }}>
    <BookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
      completed={overview?.completed ?? null} owned={book.owned} installed={ready}
      busy={checking ? '확인 중' : progress !== null ? `${progress} / ${book.sentences}` : undefined}
      onPress={() => {
        if (!book.owned) { Alert.alert('구매 기능 준비 중', '아직 결제되지 않습니다. 구매 기능은 추후 제공됩니다.'); return; }
        if (ready) { if (select({ language: book.language, book: book.id, packageKey: book.packageKey })) router.navigate('/lesson'); }
        else void install();
      }} />
    {progress !== null && <ProgressTrack value={progress} total={book.sentences} label="레슨 설치 진행" blue />}
  </View>;
}
