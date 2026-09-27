import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
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
import { useVerifiedPackageLearningAccess } from './use-package-learning-access';
import { AnalysisBrowser } from './analysis-browser';
import { Label } from './ui';
import { useSettingsColors } from './settings-row';

export function PlayerAnalysis() {
  const c = useSettingsColors();
  const params = useLocalSearchParams<{ stage: string; package: string; phrase: string; run: string; profile: string; authority: string }>();
  const stage = playableStage(params.stage), pack = selectedPackage(params.package), profile = useProgressProfile();
  const access = useVerifiedPackageLearningAccess(pack);
  const identity = JSON.stringify([params, profile.id, profile.authority]);
  const [result, setResult] = useState<{ key: string; sentences: AnalysisSentence[] | null } | null>(null);
  const validEntry = !!stage && !!pack && profile.available && params.profile === profile.id
    && Number(params.authority) === profile.authority;
  const valid = validEntry && access.allowed;
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
  const loading = validEntry && (access.checking || (access.allowed && !content));
  if (content?.sentences) return <AnalysisBrowser key={identity} sentences={content.sentences} onClose={() => router.back()} />;
  return <>
    <ScrollView style={{ backgroundColor: c.sheet }} contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
      {loading
        ? <ActivityIndicator size="large" color={c.secondary} accessibilityLabel="문장 분석 로딩 중" accessibilityState={{ busy: true }} />
        : <Label muted align="center">이 학습에서는 문장 분석을 지원하지 않아요.</Label>}
    </ScrollView>
    <Stack.Screen options={{ title: '문장 분석', sheetAllowedDetents: [1],
      headerStyle: { backgroundColor: c.sheet }, contentStyle: { backgroundColor: c.sheet } }} />
    <Stack.Toolbar placement="right"><Stack.Toolbar.Button icon="xmark" accessibilityLabel="분석 닫기" onPress={() => router.back()} /></Stack.Toolbar>
  </>;
}
