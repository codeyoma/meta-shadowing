import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { learningPreferenceMenus } from '@/components/learning-preference-menu';
import { LearningPreferenceSection } from '@/components/learning-preference-section';
import { readSettings, saveSettings, type Settings } from '@/native/settings';
import { useProgressProfile } from '@/components/progress-profile';
import { useSettingsColors } from '@/components/settings-row';

export default function LearningPreferenceScreen() {
  const { option } = useLocalSearchParams<{ option: string }>();
  const menu = learningPreferenceMenus.find(item => item.option === option);
  const profile = useProgressProfile(), c = useSettingsColors();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sliderRevision, setSliderRevision] = useState(0);
  useEffect(() => {
    try { setSettings(readSettings()); }
    catch { Alert.alert('설정을 읽을 수 없어요', '저장 공간을 확인하고 앱을 다시 열어 주세요.'); }
  }, []);
  function change(patch: Partial<Settings>) {
    if (!settings) return;
    try {
      const next = { ...readSettings(), ...patch };
      saveSettings(next, profile.id); setSettings(next);
    }
    catch {
      setSliderRevision(value => value + 1);
      Alert.alert('설정을 저장하지 못했어요', '저장 공간을 확인하고 다시 시도해 주세요.');
    }
  }
  if (!menu) return <Redirect href="/settings/learning" />;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }}
    contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 40 }}>
    <Stack.Screen options={{ title: menu.title, headerTintColor: c.text }} />
    {settings && <LearningPreferenceSection key={`${menu.option}-${sliderRevision}`} option={menu.option} settings={settings} onChange={change} />}
  </ScrollView>;
}
