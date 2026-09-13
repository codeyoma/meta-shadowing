import { Stack } from 'expo-router';
import { useSettingsColors } from '@/components/settings-row';

export default function SettingsLayout() {
  const c = useSettingsColors();
  return <Stack screenOptions={{ contentStyle: { backgroundColor: c.background },
    headerTransparent: true, headerBlurEffect: 'none',
    headerStyle: { backgroundColor: `${c.background}33` }, headerTintColor: c.text,
    headerShadowVisible: false, headerTitleStyle: { fontWeight: '700' } }}>
    <Stack.Screen name="index" options={{ title: '설정' }} />
    <Stack.Screen name="learning" options={{ title: '학습 설정', headerBackButtonDisplayMode: 'minimal' }} />
    <Stack.Screen name="learning-detail" options={{ title: '학습 설정', headerBackButtonDisplayMode: 'minimal' }} />
    <Stack.Screen name="icloud" options={{ title: 'iCloud 백업', headerBackButtonDisplayMode: 'minimal' }} />
  </Stack>;
}
