import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton, HeaderButton } from '@/components/ui';
import { LearningPreferenceSection, type LearningPreference } from '@/components/learning-preference-section';
import { useSettingsColors } from '@/components/settings-row';
import { LearningPreferenceMenu, learningPreferenceMenus } from '@/components/learning-preference-menu';
import { readSettings, saveSettings, type Settings } from '@/native/settings';
import { playableStage } from '@/core/catalog';
import { changeSessionRate } from '@/core/session';
import { getJournal } from '@/native/journal';
import { selectedPackage } from '@/native/catalog';
import { LearningContext } from '@/core/learning-context';
import { getProgressSync } from '@/native/progress-sync';
import { useProgressProfile } from '@/components/progress-profile';

export default function PlayerOptionsScreen() {
  const profile = useProgressProfile();
  const c = useSettingsColors();
  const insets = useSafeAreaInsets();
  const { stage: param, package: key, option } = useLocalSearchParams<{ stage: string; package: string; option?: string }>();
  const stage = playableStage(param);
  const pack = selectedPackage(key);
  const [rate, setRate] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState<LearningPreference | null>(() => option === 'rate' ? 'rate' : null);
  useEffect(() => {
    try {
      setSettings(readSettings());
      setRate(stage && pack ? new LearningContext(pack, getJournal()).load(stage)?.rate ?? null : null);
    } catch { Alert.alert('학습 옵션을 열 수 없어요', '저장된 학습 기록을 확인해 주세요. 기록은 초기화하지 않았어요.'); }
  }, [stage, pack]);
  function changePreference(patch: Partial<Settings>) {
    if (patch.rate !== undefined) { change(patch.rate); return; }
    if (!settings || profile.id !== getProgressSync().profiles.id()) return;
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
      Alert.alert('재생 속도를 저장하지 못했어요', '학습 위치는 유지됩니다. 저장 공간을 확인하고 다시 시도해 주세요.');
    }
  }
  return <View style={{ flex: 1, backgroundColor: c.sheet }}>
    <Stack.Screen options={{ title: learningPreferenceMenus.find(menu => menu.option === selected)?.title ?? '학습 옵션',
      headerLeft: selected ? () => <HeaderButton title="학습 옵션으로 돌아가기" icon="chevron.left" onPress={() => setSelected(null)} /> : undefined,
      headerTransparent: true, headerBlurEffect: 'none',
      headerStyle: { backgroundColor: 'transparent' }, headerTintColor: c.text,
      contentStyle: { backgroundColor: c.sheet },
      headerRight: () => <HeaderButton title="옵션 닫기" icon="xmark" onPress={() => router.back()} /> }} />
    {/* Keep the sheet's native scroll-frame correction separate from the fixed footer. */}
    <View collapsable={false} style={{ flex: 1 }}>
      <ScrollView key={selected ?? 'menu'} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {selected === null ? <LearningPreferenceMenu onSelect={setSelected} disabled={!settings} rateDisabled={rate === null} />
          : settings && <LearningPreferenceSection key={`${selected}-${revision}`} option={selected}
          settings={{ ...settings, rate: rate ?? settings.rate }} onChange={changePreference} />}
      </ScrollView>
    </View>
    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(16, insets.bottom), gap: 16 }}>
      <ActionButton title="스테이지로 돌아가기" icon="rectangle.portrait.and.arrow.right" iconMirrored tone="cardinal" secondary onPress={() => router.dismissTo('/lesson')} />
      <ActionButton title="학습 이어하기" icon="play.fill" onPress={() => router.back()} />
    </View>
  </View>;
}
