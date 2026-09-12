import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Slider from '@react-native-community/slider';
import { ActionButton, HeaderButton, Label, usePalette } from '@/components/ui';
import { MethodLabel } from '@/components/method-label';
import { playableStage } from '@/core/catalog';
import { changeSessionRate } from '@/core/session';
import { getJournal } from '@/native/journal';
import { selectedPackage } from '@/native/catalog';
import { LearningContext } from '@/core/learning-context';
import { getProgressSync } from '@/native/progress-sync';
import { useProgressProfile } from '@/components/progress-profile';

export default function PlayerOptionsScreen() {
  const profile = useProgressProfile();
  const { stage: param, package: key } = useLocalSearchParams<{ stage: string; package: string }>();
  const stage = playableStage(param);
  const c = usePalette();
  const pack = selectedPackage(key);
  const [rate, setRate] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    try {
      setRate(stage && pack ? new LearningContext(pack, getJournal()).load(stage)?.rate ?? null : null);
    } catch { Alert.alert('학습 옵션을 열 수 없어요', '저장된 학습 기록을 확인해 주세요. 기록은 초기화하지 않았어요.'); }
  }, [stage, pack]);
  function change(rate: number) {
    if (!stage || !pack || profile.id !== getProgressSync().profiles.id()) return;
    try {
      const context = new LearningContext(pack, getJournal());
      const saved = context.load(stage);
      if (!saved) throw Error('Missing checkpoint.');
      const next = changeSessionRate(saved, Number(rate.toFixed(2)));
      context.save(next);
      setRate(next.rate);
    } catch {
      setRevision(value => value + 1);
      Alert.alert('배속을 저장하지 못했어요', '학습 위치는 유지됩니다. 저장 공간을 확인하고 다시 시도해 주세요.');
    }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 40 }}>
    <Stack.Screen options={{ headerRight: () => <HeaderButton title="옵션 닫기" icon="xmark" onPress={() => router.back()} /> }} />
    <View style={{ alignItems: 'flex-start', gap: 8 }}>
      <Label size={20} weight="700">메타쉐도잉</Label>
      {stage && <MethodLabel stage={stage} />}
      <Label size={14} muted>학습 위치가 저장되었어요. 닫은 뒤 재생 버튼으로 이어가세요.</Label>
    </View>
    {rate !== null && <View style={{ gap: 8 }}>
      <Label weight="700">음성 속도 · {rate}×</Label>
      <Slider key={revision} value={rate} minimumValue={0.25} maximumValue={3} step={0.05}
        accessibilityLabel="현재 학습 음성 속도" accessibilityRole="adjustable"
        accessibilityValue={{ min: 0.25, max: 3, now: rate, text: `${rate}배` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') change(Math.min(3, rate + 0.05));
          if (nativeEvent.actionName === 'decrement') change(Math.max(0.25, rate - 0.05));
        }}
        onSlidingComplete={change} minimumTrackTintColor={c.accentPressed} maximumTrackTintColor={c.line}
        style={{ width: '100%', height: 48 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label size={13} muted>0.25×</Label><Label size={13} muted>3×</Label></View>
    </View>}
    <ActionButton title="학습 이어하기" icon="play.fill" onPress={() => router.back()} />
    <ActionButton title="스테이지로 돌아가기" icon="rectangle.portrait.and.arrow.right" tone="cardinal" secondary onPress={() => router.dismissTo('/lesson')} />
  </ScrollView>;
}
