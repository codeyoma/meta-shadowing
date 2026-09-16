import { ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { selectedPackage } from '@/native/catalog';
import { playableStage } from '@/core/catalog';
import { Card, HeaderButton, Label } from '@/components/ui';
import { methodNames } from '@/components/method-label';

export default function PlayerInfo() {
  const { kind, stage: rawStage, package: key, phrase: rawPhrase } = useLocalSearchParams<{
    kind: string; stage: string; package: string; phrase: string;
  }>();
  const stage = playableStage(rawStage), pack = selectedPackage(key);
  const index = Number(rawPhrase);
  const phrase = Number.isSafeInteger(index) && index >= 0 ? pack?.manifest.phrases[index] : undefined;
  const analysis = kind === 'analysis';
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 20 }}>
    <Stack.Screen options={{ title: analysis ? '문장 분석' : '학습 가이드',
      headerRight: () => <HeaderButton title="닫기" icon="xmark" feedback={false} onPress={() => router.back()} /> }} />
    {!pack || !stage || (kind !== 'guide' && !analysis) ? <Label muted>학습 정보를 열 수 없어요.</Label>
      : analysis ? <>
        {phrase && <Card><Label size={25} display>{phrase.text}</Label><Label muted>{phrase.translation}</Label></Card>}
        <Label muted>문장 분석은 준비 중이에요.</Label>
      </> : <>
        <Label size={25} display>메타쉐도잉 Lv {Math.ceil(stage / 2)}</Label>
        <Label size={20}>{methodNames[Math.ceil(stage / 2) - 1]}</Label>
      </>}
  </ScrollView>;
}
