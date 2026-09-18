import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton, HeaderButton } from '@/components/ui';
import { LearningPreferenceSection, type LearningPreference } from '@/components/learning-preference-section';
import { SettingsRow, useSettingsColors } from '@/components/settings-row';
import { LearningPreferenceMenu, learningPreferenceMenus } from '@/components/learning-preference-menu';
import { readSettings, saveSettings, type Settings } from '@/native/settings';
import { isPlayableStage, playableStage } from '@/core/catalog';
import { changeSessionRate } from '@/core/session';
import { getJournal } from '@/native/journal';
import { selectedPackage } from '@/native/catalog';
import { LearningContext } from '@/core/learning-context';
import { getProgressSync } from '@/native/progress-sync';
import { useProgressProfile } from '@/components/progress-profile';
import { jumpToSourcePhrase } from '@/core/session-navigation';
import { sentenceEntry } from '@/core/sentence-entry';
import { sentenceSections } from '@/core/sentence-menu';
import { SentenceMenu } from '@/components/sentence-menu';
import { isInstalled } from '@/native/package';
import { testStageAccess } from '@/native/stage-access';
import { canOpenStage } from '@/core/stage-overview';
import type { Session } from '@/core/session';

export default function PlayerOptionsScreen() {
  const profile = useProgressProfile();
  const c = useSettingsColors();
  const insets = useSafeAreaInsets();
  const { stage: param, package: key, option, run, profile: boundProfile } = useLocalSearchParams<{ stage: string; package: string; option?: string; run?: string; profile?: string }>();
  const stage = playableStage(param);
  const pack = selectedPackage(key);
  const [rate, setRate] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState<LearningPreference | 'sentences' | null>(() => option === 'rate' ? 'rate' : null);
  const [checkpoint, setCheckpoint] = useState<Session | null>(null);
  const [selecting, setSelecting] = useState(false);
  const generation = useRef(0), pending = useRef(false);
  const sections = useMemo(() => pack && checkpoint
    ? sentenceSections(pack.manifest.phrases, new LearningContext(pack, getJournal()).units(checkpoint)) : [], [pack, checkpoint]);
  const scopeValid = () => boundProfile === profile.id && profile.id === getProgressSync().profiles.id();
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active') { generation.current++; sentenceEntry.cancel(); }
    });
    return () => { generation.current++; listener.remove(); };
  }, [profile.id, run, key, param]);
  useEffect(() => {
    try {
      setSettings(readSettings());
      const saved = stage && pack && scopeValid() ? new LearningContext(pack, getJournal()).load(stage) : null;
      const valid = saved?.runId === run ? saved : null;
      setCheckpoint(valid); setRate(valid?.rate ?? null);
    } catch { Alert.alert('학습 옵션을 열 수 없어요', '저장된 학습 기록을 확인해 주세요. 기록은 초기화하지 않았어요.'); }
  }, [stage, pack, run, boundProfile, profile.id]);
  async function selectSentence(sourceIndex: number) {
    if (!stage || !pack || !pack.owned || !scopeValid() || pending.current) return;
    const currentGeneration = generation.current;
    pending.current = true; setSelecting(true); sentenceEntry.cancel();
    try {
      const installed = await isInstalled(pack);
      const bypass = await testStageAccess();
      if (currentGeneration !== generation.current || AppState.currentState !== 'active' || !scopeValid()) return;
      if (!installed || !pack.owned) throw Error('Unavailable package.');
      const context = new LearningContext(pack, getJournal());
      const predecessor = stage - 1;
      const records = isPlayableStage(predecessor) ? [{ stage: predecessor, count: context.completions(predecessor), session: null }] : [];
      if (!canOpenStage(stage, records, bypass)) throw Error('Unavailable stage.');
      const saved = context.load(stage);
      if (!saved || saved.runId !== run || saved.phase === 'complete') throw Error('Stale run.');
      const next = jumpToSourcePhrase(saved, sourceIndex);
      context.save(next);
      sentenceEntry.request({ profile: profile.id, packageKey: pack.packageKey, stage, runId: next.runId, phrase: next.phrase });
      router.back();
    } catch {
      sentenceEntry.cancel();
      if (currentGeneration === generation.current) Alert.alert('문장을 선택할 수 없어요', '학습 기록과 레슨 설치 상태를 확인하고 다시 시도해 주세요.');
    } finally { pending.current = false; setSelecting(false); }
  }
  function changePreference(patch: Partial<Settings>) {
    if (patch.rate !== undefined) { change(patch.rate); return; }
    if (!settings || !scopeValid()) return;
    try {
      const next = { ...readSettings(), ...patch };
      saveSettings(next, profile.id);
      setSettings(next);
    } catch {
      setRevision(value => value + 1);
      Alert.alert('설정을 저장하지 못했어요', '저장 공간을 확인하고 다시 시도해 주세요.');
    }
  }
  function change(rate: number) {
    if (!stage || !pack || !scopeValid()) return;
    try {
      const context = new LearningContext(pack, getJournal());
      const saved = context.load(stage);
      if (!saved || saved.runId !== run) throw Error('Missing checkpoint.');
      const next = changeSessionRate(saved, Number(rate.toFixed(2)));
      context.save(next);
      setRate(next.rate);
    } catch {
      setRevision(value => value + 1);
      Alert.alert('재생 속도를 저장하지 못했어요', '학습 위치는 유지됩니다. 저장 공간을 확인하고 다시 시도해 주세요.');
    }
  }
  return <View style={{ flex: 1, backgroundColor: c.sheet }}>
    <Stack.Screen options={{ title: selected === 'sentences' ? '전체 문장' : learningPreferenceMenus.find(menu => menu.option === selected)?.title ?? '학습 옵션',
      headerLeft: selected ? () => <HeaderButton title="학습 옵션으로 돌아가기" icon="chevron.left" onPress={() => setSelected(null)} /> : undefined,
      headerTransparent: true, headerBlurEffect: 'none',
      headerStyle: { backgroundColor: 'transparent' }, headerTintColor: c.text,
      contentStyle: { backgroundColor: c.sheet },
      headerRight: () => <HeaderButton title="옵션 닫기" icon="xmark" onPress={() => { generation.current++; sentenceEntry.cancel(); router.back(); }} /> }} />
    {/* Keep the sheet's native scroll-frame correction separate from the fixed footer. */}
    <View collapsable={false} style={{ flex: 1 }}>
      {selected === 'sentences' ? <SentenceMenu sections={sections} currentUnit={checkpoint?.phrase ?? -1}
        disabled={selecting || !checkpoint || !scopeValid()} onSelect={index => void selectSentence(index)} />
      : <ScrollView key={selected ?? 'menu'} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {selected === null ? <><View style={{ borderRadius: 24, overflow: 'hidden' }}>
          <SettingsRow title="전체 문장" icon="list.bullet" iconColor="#007aff" disclosure disabled={!checkpoint}
            onPress={() => setSelected('sentences')} /></View>
          <LearningPreferenceMenu onSelect={setSelected} disabled={!settings} rateDisabled={rate === null} /></>
          : settings && <LearningPreferenceSection key={`${selected}-${revision}`} option={selected}
          settings={{ ...settings, rate: rate ?? settings.rate }} onChange={changePreference} />}
      </ScrollView>}
    </View>
    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(16, insets.bottom), gap: 16 }}>
      <ActionButton title="스테이지로 돌아가기" icon="rectangle.portrait.and.arrow.right" iconMirrored tone="cardinal" secondary onPress={() => { generation.current++; sentenceEntry.cancel(); router.dismissTo('/lesson'); }} />
      <ActionButton title="학습 이어하기" icon="play.fill" onPress={() => { generation.current++; sentenceEntry.cancel(); router.back(); }} />
    </View>
  </View>;
}
