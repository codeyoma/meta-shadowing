import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { usePalette } from '../components/ui';
import { LibraryProvider } from '@/components/library-context';
import { StudyHeader } from '@/components/study-header';
import { startTapFeedback } from '@/native/tap-feedback';

void SplashScreen.preventAutoHideAsync();

export default function Layout() {
  useEffect(startTapFeedback, []);
  const c = usePalette();
  const [fontsLoaded, fontError] = useFonts({ Nunito_800ExtraBold });
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return <LibraryProvider><StatusBar style="auto" /><Stack screenOptions={{ headerTintColor: c.text,
    headerStyle: { backgroundColor: c.background }, contentStyle: { backgroundColor: c.background }, headerShadowVisible: false,
    headerTitleStyle: { color: c.heading, fontWeight: '700' }, headerLargeTitleStyle: { color: c.heading, fontWeight: '700' } }}>
    <Stack.Screen name="(tabs)" options={{ title: '쇄도잉', header: () => <StudyHeader /> }} />
    <Stack.Screen name="player" options={{ title: '자막 쉐도잉', headerBackTitle: '레슨', gestureEnabled: false }} />
    <Stack.Screen name="player-options" options={{ title: '학습 옵션', presentation: 'formSheet',
      sheetAllowedDetents: [0.65, 1], sheetGrabberVisible: true }} />
    <Stack.Screen name="languages" options={{ title: '학습 언어', presentation: 'formSheet', sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true }} />
  </Stack></LibraryProvider>;
}
