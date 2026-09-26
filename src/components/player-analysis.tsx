import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { playableStage, isPlayableStage } from '@/core/catalog';
import { canOpenStage } from '@/core/stage-overview';
import { LearningContext } from '@/core/learning-context';
import { currentAnalysisSession, loadCurrentAnalysis } from '@/core/current-analysis';
import type { AnalysisSentence } from '@/core/sentence-analysis';
import { selectedPackage } from '@/native/catalog';
import { getJournal } from '@/native/journal';
import { getProgressSync } from '@/native/progress-sync';
import { testStageAccess } from '@/native/stage-access';
import { mayUsePackage } from '@/native/paid-package';
import { readInstalledSyntax } from '@/native/sentence-analysis';
import { useProgressProfile } from './progress-profile';
import { usePackageLearningAccess } from './use-package-learning-access';
import { AnalysisBrowser } from './analysis-browser';
import { Label } from './ui';

export function PlayerAnalysis() {
  const params = useLocalSearchParams<{ stage: string; package: string; phrase: string; run: string; profile: string; authority: string }>();
  const stage = playableStage(params.stage), pack = selectedPackage(params.package), profile = useProgressProfile();
  const access = usePackageLearningAccess(pack);
  const identity = JSON.stringify([params, profile.id, profile.authority]);
  const [result, setResult] = useState<{ key: string; sentences: AnalysisSentence[] | null } | null>(null);
  const valid = !!stage && !!pack && access && profile.available && params.profile === profile.id
    && Number(params.authority) === profile.authority;
  useEffect(() => {
    let active = true;
    setResult(null);
    if (!valid || !pack || !stage) return;
    const context = new LearningContext(pack, getJournal());
    const scope = { stage, phrase: Number(params.phrase), run: params.run };
    const authorized = () => active && mayUsePackage(pack) && getProgressSync().authorized(profile.authority, profile.id);
    const unsubscribe = getProgressSync().subscribe(() => {
      try {
        if (currentAnalysisSession(context, scope, authorized)) return;
      } catch { /* Unreadable checkpoints must remove already displayed source text. */ }
      active = false;
      setResult({ key: identity, sentences: null });
    });
    void (async () => {
      try {
        const bypass = await testStageAccess();
        const previous = stage - 1;
        if (!authorized() || !canOpenStage(stage, isPlayableStage(previous)
          ? [{ stage: previous, count: context.completions(previous), session: null }] : [], bypass)) {
          if (active) setResult({ key: identity, sentences: null });
          return;
        }
        const sentences = await loadCurrentAnalysis(context, scope,
          authorized, () => readInstalledSyntax(pack));
        if (authorized()) setResult({ key: identity, sentences });
      } catch { if (active) setResult({ key: identity, sentences: null }); }
    })();
    return () => { active = false; unsubscribe(); };
  }, [valid, pack, stage, params.phrase, params.run, profile.id, profile.authority, identity]);
  const content = valid && result?.key === identity ? result : null;
  if (content?.sentences) return <AnalysisBrowser key={identity} sentences={content.sentences} onClose={() => router.back()} />;
  return <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24 }}>
      <Label muted>{valid && !content ? '문장 분석을 읽는 중이에요.' : '문장 분석을 사용할 수 없어요. 패키지의 분석 파일과 학습 접근 상태를 확인해 주세요.'}</Label>
    </ScrollView>
    <Stack.Screen options={{ title: '문장 분석', sheetAllowedDetents: [1] }} />
    <Stack.Toolbar placement="right"><Stack.Toolbar.Button icon="xmark" accessibilityLabel="분석 닫기" onPress={() => router.back()} /></Stack.Toolbar>
  </>;
}
