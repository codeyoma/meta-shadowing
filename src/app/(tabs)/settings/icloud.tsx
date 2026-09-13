import { ScrollView } from 'react-native';
import { ICloudBackup } from '@/components/icloud-backup';
import { Stack } from 'expo-router';
import { useSettingsColors } from '@/components/settings-row';

export default function ICloudBackupScreen() {
  const c = useSettingsColors();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
    <Stack.Screen options={{ headerTintColor: c.text }} />
    <ICloudBackup />
  </ScrollView>;
}
