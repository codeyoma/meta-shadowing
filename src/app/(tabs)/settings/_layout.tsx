import { Stack } from 'expo-router';
import { usePalette } from '@/components/ui';

export default function SettingsLayout() {
  const c = usePalette();
  return <Stack screenOptions={{ contentStyle: { backgroundColor: c.background },
    headerStyle: { backgroundColor: c.background }, headerTintColor: c.heading,
    headerShadowVisible: false, headerTitleStyle: { fontWeight: '700' } }}>
    <Stack.Screen name="index" options={{ title: '설정' }} />
    <Stack.Screen name="learning" options={{ title: '학습 설정', headerBackButtonDisplayMode: 'minimal' }} />
  </Stack>;
}
