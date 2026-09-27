import { PlatformColor, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { selectedPackage } from '@/native/catalog';
import { playableStage, isGroupedStage, isFirstWordStage, isRevealStage } from '@/core/catalog';
import { Label } from '@/components/ui';
import { methodNames } from '@/components/method-label';
import { useSettingsColors } from '@/components/settings-row';
export function LearningGuide() {
  const c = useSettingsColors(), headerHeight = useHeaderHeight();
  const { kind, stage: rawStage, package: key } = useLocalSearchParams<{
    kind: string; stage: string; package: string;
  }>();
  const stage = playableStage(rawStage), pack = selectedPackage(key);
  return <View style={{ flex: 1, backgroundColor: c.sheet }}>
    <View collapsable={false} style={{ flex: 1, paddingTop: headerHeight }}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16 }}>
    {!pack || !stage || kind !== 'guide' ? <Label muted>학습 정보를 열 수 없어요.</Label> : <>
      <View style={{ padding: 20, gap: 8, borderRadius: 24, borderCurve: 'continuous', backgroundColor: c.group }}>
        <Label size={25} display>메타쉐도잉 Lv {Math.ceil(stage / 2)}</Label>
        <Label size={20}>{methodNames[Math.ceil(stage / 2) - 1]}</Label>
      </View>
      <View style={{ padding: 20, gap: 16, borderRadius: 24, borderCurve: 'continuous', backgroundColor: c.group }}>
        <Label muted>{isRevealStage(stage)
          ? `${stage <= 12 ? '영어 → 한국어' : stage <= 14 ? '한국어 → 영어' : '한국어만'} 순서로 단어가 하나씩 쌓여요. 음성 없이 직접 말하며 연습해요. 가운데 속도 버튼에서 S1–S4를 선택할 수 있어요.`
          : isFirstWordStage(stage)
          ? '각 문장의 첫 단어를 힌트로 듣고 따라 말해요. 번역은 항상 보이며, 자막 보기를 누르면 현재 학습 구간의 원문 전체가 나타나요.'
          : '자막을 보며 음성을 듣고 따라 말해요. 1–4 스테이지는 같은 방식으로 연습해요.'}</Label>
        {isGroupedStage(stage) && <Label muted>설정한 2–4개 원본 구간을 한 묶음으로 연속 재생해요. 마지막 남은 구간은 별도 묶음으로 연습해요. 진행 중인 학습의 묶음 크기는 유지돼요.</Label>}
        <Label muted>{isRevealStage(stage)
          ? '한 번 연습하고 단어가 모두 나타나면 확인해 주세요. 3 XP를 받고 다음 프레이즈로 이동해요.'
          : '음성이 모두 끝난 뒤 직접 확인해 주세요. 세 번 연습한 뒤 다음으로 이동하거나 두 번 더 반복할 수 있어요.'}</Label>
      </View>
      </>}
    </ScrollView>
    </View>
    <View pointerEvents="none" accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, overflow: 'hidden' }}>
      <View style={{ height: 64, borderRadius: 32, borderWidth: 1, borderColor: PlatformColor('systemGray3') }} />
    </View>
    <Stack.Screen options={{ title: '학습 가이드', headerTransparent: true, headerBlurEffect: 'none',
      sheetAllowedDetents: [1], sheetCornerRadius: 32,
      headerStyle: { backgroundColor: 'transparent' }, headerTintColor: c.text,
      contentStyle: { backgroundColor: c.sheet } }} />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="xmark" accessibilityLabel="학습 가이드 닫기" tintColor={c.text} onPress={() => router.back()} />
    </Stack.Toolbar>
  </View>;
}
