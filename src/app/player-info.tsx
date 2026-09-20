import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { selectedPackage } from '@/native/catalog';
import { playableStage, isPlayableStage, isGroupedStage, isFirstWordStage, isRevealStage } from '@/core/catalog';
import { revealLines, visibleReveal } from '@/core/word-reveal';
import { LearningContext } from '@/core/learning-context';
import { presentLearningUnits } from '@/core/learning-presentation';
import { canOpenStage } from '@/core/stage-overview';
import { getJournal } from '@/native/journal';
import { isInstalled } from '@/native/package';
import { testStageAccess } from '@/native/stage-access';
import { useProgressProfile } from '@/components/progress-profile';
import { getProgressSync } from '@/native/progress-sync';
import { Card, HeaderButton, Label } from '@/components/ui';
import { methodNames } from '@/components/method-label';
import { usePackageLearningAccess } from '@/components/use-package-learning-access';
import { mayUsePackage } from '@/native/paid-package';

export default function PlayerInfo() {
  const profile = useProgressProfile();
  const { kind, stage: rawStage, package: key, phrase: rawPhrase, authority } = useLocalSearchParams<{
    kind: string; stage: string; package: string; phrase: string; authority?: string;
  }>();
  const stage = playableStage(rawStage), pack = selectedPackage(key);
  const access = usePackageLearningAccess(pack);
  const index = Number(rawPhrase);
  const contentKey = `${profile.id}:${profile.authority}:${key}:${stage}:${rawPhrase}`;
  const [result, setResult] = useState<{ key: string; text: string; translation: string } | null>(null);
  const content = access && profile.available && Number(authority) === profile.authority && result?.key === contentKey ? result : null;
  useEffect(() => {
    let active = true;
    setResult(null);
    void (async () => {
      try {
        if (!access || !pack || !stage || !await isInstalled(pack)) return;
        const bypass = await testStageAccess();
        if (!active || !mayUsePackage(pack) || Number(authority) !== profile.authority || !getProgressSync().authorized(profile.authority, profile.id)) return;
        const context = new LearningContext(pack, getJournal());
        const predecessor = stage - 1;
        if (!canOpenStage(stage, isPlayableStage(predecessor)
          ? [{ stage: predecessor, count: context.completions(predecessor), session: null }] : [], bypass)) return;
        const saved = context.load(stage);
        if (!saved || !Number.isSafeInteger(index) || index !== saved.phrase) return;
        // Analysis never carries subtitle reveal state across route boundaries.
        const unit = presentLearningUnits(context.units(saved), stage, null)[index];
        if (unit && saved.reveal) {
          const lines = visibleReveal(revealLines(unit, stage), saved.audioSeconds, saved.reveal.wpm,
            ['speaking', 'decision', 'complete'].includes(saved.phase));
          // Preserve timed visibility and language order; never expose a hidden answer here.
          setResult({ key: contentKey, text: lines.map(line => line.visibleText).filter(Boolean).join('\n'), translation: '' });
        } else if (unit) setResult({ key: contentKey, ...unit });
      } catch { /* Missing or incompatible content stays hidden. */ }
    })();
    return () => { active = false; };
  }, [pack, stage, index, profile.id, profile.authority, profile.available, contentKey, authority, access]);
  const analysis = kind === 'analysis';
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 20 }}>
    <Stack.Screen options={{ title: analysis ? '문장 분석' : '학습 가이드',
      headerRight: () => <HeaderButton title="닫기" icon="xmark" feedback={false} onPress={() => router.back()} /> }} />
    {!pack || !stage || (kind !== 'guide' && !analysis) ? <Label muted>학습 정보를 열 수 없어요.</Label>
      : analysis ? <>
        {content && <Card><Label size={25} display>{content.text}</Label>{!!content.translation && <Label muted>{content.translation}</Label>}</Card>}
        {isFirstWordStage(stage) && <Label muted>전체 자막은 학습 화면의 ‘자막 보기’에서 확인할 수 있어요.</Label>}
        <Label muted>문장 분석은 준비 중이에요.</Label>
      </> : <>
        <Label size={25} display>메타쉐도잉 Lv {Math.ceil(stage / 2)}</Label>
        <Label size={20}>{methodNames[Math.ceil(stage / 2) - 1]}</Label>
        <Label muted>{isRevealStage(stage)
          ? `${stage <= 12 ? '영어 → 한국어' : stage <= 14 ? '한국어 → 영어' : '한국어만'} 순서로 단어가 하나씩 쌓여요. 음성 없이 직접 말하며 연습해요. 가운데 속도 버튼에서 S1–S4를 선택할 수 있어요.`
          : isFirstWordStage(stage)
          ? '각 문장의 첫 단어를 힌트로 듣고 따라 말해요. 번역은 항상 보이며, 자막 보기를 누르면 현재 학습 구간의 원문 전체가 나타나요.'
          : '자막을 보며 음성을 듣고 따라 말해요. 1–4 스테이지는 같은 방식으로 연습해요.'}</Label>
        {isGroupedStage(stage) && <Label muted>설정한 2–4개 원본 구간을 한 묶음으로 연속 재생해요. 마지막 남은 구간은 별도 묶음으로 연습해요. 진행 중인 학습의 묶음 크기는 유지돼요.</Label>}
        <Label muted>{isRevealStage(stage)
          ? '한 번 연습하고 단어가 모두 나타나면 확인해 주세요. 3 XP를 받고 다음 프레이즈로 이동해요.'
          : '음성이 모두 끝난 뒤 직접 확인해 주세요. 세 번 연습한 뒤 다음으로 이동하거나 두 번 더 반복할 수 있어요.'}</Label>
      </>}
  </ScrollView>;
}
