import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { ProgressDataManagement } from '@/components/progress-data-management';
import { useSettingsColors } from '@/components/settings-row';

export default function DataManagementScreen() {
  const c = useSettingsColors();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }}
    contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
    <Stack.Screen options={{ headerTintColor: c.text }} />
    <ProgressDataManagement />
  </ScrollView>;
}
