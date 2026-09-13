import { ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { RestorePurchases } from '@/components/restore-purchases';
import { SettingsRow, useSettingsColors } from '@/components/settings-row';

export default function SettingsScreen() {
  const c = useSettingsColors();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.background }}
    contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
    <Stack.Screen options={{ headerTintColor: c.text }} />
    <View style={{ backgroundColor: c.group, borderRadius: 24, borderCurve: 'continuous', overflow: 'hidden' }}>
      <SettingsRow title="학습 설정" icon="slider.horizontal.3" iconColor="#8e8e93" disclosure separator
        onPress={() => router.push('/settings/learning')} />
      <SettingsRow title="iCloud 백업" icon="icloud.fill" iconColor="#007aff" disclosure separator
        onPress={() => router.push('/settings/icloud')} />
      <RestorePurchases />
    </View>
  </ScrollView>;
}
