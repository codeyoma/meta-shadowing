import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { learningPreferenceMenus } from '@/components/learning-preference-menu';
import { LearningPreferenceSection } from '@/components/learning-preference-section';
import { readSettings, saveSettings, type Settings } from '@/native/settings';
import { useProgressProfile } from '@/components/progress-profile';
import { useSettingsColors } from '@/components/settings-row';
import { useLearningSettings } from '@/components/use-learning-settings';

export default function LearningPreferenceScreen() {
  const { option } = useLocalSearchParams<{ option: string }>();
  const menu = learningPreferenceMenus.find(item => item.option === option);
  const profile = useProgressProfile(), c = useSettingsColors();
  const settings = useLearningSettings();
  const [sliderRevision, setSliderRevision] = useState(0);
  function change(patch: Partial<Settings>) {
    if (!settings) return false;
    try {
      const next = { ...readSettings(), ...patch };
      if (!saveSettings(next, profile.id, profile.authority)) throw Error('Unavailable settings authority.');
      return true;
    }
    catch {
      setSliderRevision(value => value + 1);
      Alert.alert('설정을 저장하지 못했어요', '저장 공간을 확인하고 다시 시도해 주세요.');
      return false;
    }
  }
  if (!menu) return <Redirect href="/settings/learning" />;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={{ backgroundColor: c.background }}
    contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 40 }}>
    <Stack.Screen options={{ title: menu.title, headerTintColor: c.text }} />
    {settings && <LearningPreferenceSection key={`${menu.option}-${sliderRevision}`} option={menu.option} settings={settings} onChange={change} />}
  </ScrollView>;
}
