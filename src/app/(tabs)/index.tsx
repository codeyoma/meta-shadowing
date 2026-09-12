import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Label, ProgressTrack, usePalette } from '@/components/ui';
import { BookCard } from '@/components/book-card';
import { useBookRecords } from '@/components/use-book-records';
import { installSample, isInstalled } from '@/native/package';
import { useLibrary } from '@/components/library-context';
import { availableBooks } from '@/core/catalog';
import { books, languages } from '@/native/catalog';

export default function Library() {
  const c = usePalette();
  const { selection, select } = useLibrary();
  const { overview } = useBookRecords();
  const catalog = availableBooks(books, selection.language);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setChecking(true);
    isInstalled().then(value => { if (active) setReady(value); })
      .catch(() => { if (active) Alert.alert('레슨을 확인할 수 없어요', '저장 공간을 확인하고 다시 시도해 주세요.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []));
  async function install() {
    setProgress(0);
    try { await installSample(setProgress); setReady(true); }
    catch { Alert.alert('레슨을 설치하지 못했어요', '저장 공간과 연결을 확인하고 다시 시도해 주세요. 설치가 끝나기 전에는 학습을 시작할 수 없어요.'); }
    finally { setProgress(null); }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 40 }}>
    <View style={{ backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', alignSelf: 'center', width: '100%', maxWidth: 260 }}>
      <Image source={require('../../../assets/brand/logo.png')} accessibilityLabel="쇄도잉" accessible
        contentFit="contain" style={{ width: '100%', aspectRatio: 2 }} />
    </View>
    <Label size={27} weight="800" color={c.heading}>{languages.find(l => l.id === selection.language)?.name} 도서</Label>
    {catalog.map(book => <View key={book.id} style={{ gap: 10 }}>
      <BookCard title={book.title} sentences={book.sentences} chapters={book.chapters}
        completed={overview?.completed ?? null} owned={book.owned} installed={ready}
        busy={checking ? '확인 중' : progress !== null ? `${progress} / ${book.sentences}` : undefined}
        onPress={() => {
          if (!book.owned) { Alert.alert('구매 기능 준비 중', '아직 결제되지 않습니다. 구매 기능은 추후 제공됩니다.'); return; }
          if (ready) { if (select({ language: book.language, book: book.id })) router.navigate('/lesson'); }
          else void install();
        }} />
      {progress !== null && <ProgressTrack value={progress} total={book.sentences} label="레슨 설치 진행" blue />}
    </View>)}
    {!catalog.length && <Label muted>이 언어에서 지원하는 도서가 아직 없어요.</Label>}
  </ScrollView>;
}
