import { ScrollView } from 'react-native';
import { Stack, router } from 'expo-router';
import { LearningPreferenceMenu } from '@/components/learning-preference-menu';
import { useSettingsColors } from '@/components/settings-row';

export default function LearningSettingsScreen() {
  const c = useSettingsColors();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }}
    contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
    <Stack.Screen options={{ headerTintColor: c.text }} />
    <LearningPreferenceMenu onSelect={option => router.push({ pathname: '/settings/learning-detail', params: { option } })} />
  </ScrollView>;
}
