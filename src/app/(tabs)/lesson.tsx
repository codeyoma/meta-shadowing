import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { FeedbackPressable as Pressable } from '@/components/feedback-pressable';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Card, Label, ActionButton, Icon, usePalette } from '@/components/ui';
import { StagePath } from '@/components/stage-path';
import { useBookRecords } from '@/components/use-book-records';
import { useLibrary } from '@/components/library-context';
import { isInstalled } from '@/native/package';
import { books, languages } from '@/native/catalog';
import { canOpenStage } from '@/core/stage-overview';
import { MethodLabel } from '@/components/method-label';

export default function Lesson() {
  const c = usePalette();
  const { selection, progress } = useLibrary();
  const selectedBook = books.find(book => book.id === selection.book && book.language === selection.language);
  const { records, overview } = useBookRecords();
  const [ready, setReady] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setReady(null);
    if (selectedBook && !selectedBook.owned) setReady(false);
    if (selectedBook?.owned) isInstalled().then(value => { if (active) setReady(value); })
      .catch(() => { if (active) Alert.alert('레슨을 확인할 수 없어요', '저장 공간을 확인하고 다시 시도해 주세요.'); });
    return () => { active = false; };
  }, [selectedBook]));
  function open(stage: number) {
    if (ready && selectedBook?.owned && records && canOpenStage(stage, records)) router.push({ pathname: '/player', params: { stage } });
  }
  if (!selectedBook) return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 40 }}>
    <Label size={27} weight="800" color={c.heading}>{languages.find(l => l.id === selection.language)?.name} 스테이지</Label>
    <Label muted>이 언어에서 지원하는 도서가 아직 없어요.</Label>
    <ActionButton title="도서 선택으로" onPress={() => router.navigate('/')} />
  </ScrollView>;
  const current = records?.find(record => record.stage === overview?.current);
  const resumed = current?.session && current.session.phase !== 'complete';
  const daily = progress?.daily;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
    <View style={{ backgroundColor: '#243541', padding: 18, borderRadius: 26, gap: 14, borderCurve: 'continuous' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image source={require('../../../assets/illustrations/morning-notes.png')} accessible={false}
          style={{ width: 52, height: 62, borderRadius: 12 }} contentFit="cover" />
        <View style={{ flex: 1, gap: 3 }}>
          <Label size={11} weight="700" color="#b8c7d8">{selectedBook.sentences}문장 · 챕터 {selectedBook.chapters ?? '—'}</Label>
          <Label size={22} display color="#ffffff">{selectedBook.title}</Label>
        </View>
        <Label size={17} display color={c.accent}>{overview ? `${overview.percent}%` : '—'}</Label>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View accessibilityRole="progressbar" accessibilityLabel="필수 반복을 완료한 스테이지"
        accessibilityValue={{ min: 0, max: 16, now: overview?.completed ?? 0 }}
        style={{ flex: 1, height: 9, borderRadius: 5, backgroundColor: '#465661', overflow: 'hidden' }}>
        <View style={{ width: `${overview?.percent ?? 0}%`, height: '100%', backgroundColor: c.accent, borderRadius: 5 }} />
      </View>
      <Label size={12} weight="700" color="#b8c7d8">{overview?.completed ?? '—'}/16</Label>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Stage ${overview?.current ?? 1} ${resumed ? '이어하기' : '학습 시작'}`}
        disabled={!ready || !overview} accessibilityState={{ disabled: !ready || !overview }}
        onPress={() => open(overview!.current)} style={({ pressed }) => ({ padding: 14, minHeight: 66, gap: 12,
          flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: c.accent,
          opacity: !ready || !overview ? 0.5 : pressed ? 0.75 : 1, boxShadow: `0 4px 0 ${c.accentPressed}` })}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label size={11} weight="800" color={c.onAccent}>STAGE {String(overview?.current ?? 1).padStart(2, '0')}</Label>
          <View style={{ alignSelf: 'flex-start' }}><MethodLabel stage={overview?.current ?? 1} onAccent /></View>
          {resumed && <Label size={12} color={c.onAccent}>{current!.session!.phrase + 1}번 문장 · {current!.session!.confirmed}/{current!.session!.planned}회</Label>}
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4, maxWidth: '40%' }}>
          <Icon name="play.circle" size={27} color={c.onAccent} />
          <Label size={13} weight="800" color={c.onAccent} align="center">{resumed ? '이어하기' : '학습 시작'}</Label>
        </View>
      </Pressable>
      {daily && <Label size={12} color="#b8c7d8">오늘의 XP · Stage {daily.stage} · {daily.awarded}/{daily.limit}회</Label>}
    </View>
    {ready === false && <Card><Label>레슨 설치가 필요해요.</Label><ActionButton title="도서 선택으로" onPress={() => router.navigate('/')} /></Card>}
    {records && overview && <StagePath records={records} current={overview.current} ready={ready === true} onSelect={open} />}
  </ScrollView>;
}
