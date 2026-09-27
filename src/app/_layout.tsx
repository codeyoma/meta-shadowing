import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { usePalette } from '../components/ui';
import { LibraryProvider } from '@/components/library-context';
import { StudyHeader } from '@/components/study-header';
import { startPurchases } from '@/native/purchases';
import { startPackageAvailability } from '@/native/package-availability';
import { ProgressProfile } from '@/components/progress-profile';
import { LaunchScreen } from '@/components/launch-screen';

void SplashScreen.preventAutoHideAsync();

export default function Layout() {
  useEffect(startPurchases, []);
  useEffect(startPackageAvailability, []);
  const c = usePalette();
  const [fontsLoaded, fontError] = useFonts({ Nunito_800ExtraBold });
  return <LaunchScreen ready={fontsLoaded || !!fontError}><ProgressProfile><LibraryProvider><Stack screenOptions={{ headerTintColor: c.text,
    headerStyle: { backgroundColor: c.background }, contentStyle: { backgroundColor: c.background }, headerShadowVisible: false,
    headerTitleStyle: { color: c.heading, fontWeight: '700' }, headerLargeTitleStyle: { color: c.heading, fontWeight: '700' } }}>
    <Stack.Screen name="(tabs)" options={{ title: '쇄도잉', header: () => <StudyHeader /> }} />
    <Stack.Screen name="player" options={{ title: '자막 쉐도잉', headerBackTitle: '레슨', gestureEnabled: false }} />
    <Stack.Screen name="player-options" options={{ title: '학습 옵션', presentation: 'formSheet',
      sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
    <Stack.Screen name="player-info" options={{ title: '학습 가이드', presentation: 'formSheet',
      sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
    <Stack.Screen name="languages" options={{ title: '학습 언어', presentation: 'formSheet', sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true }} />
    <Stack.Screen name="monitoring-lab" options={{ title: '음성 모니터링 실험' }} />
  </Stack></LibraryProvider></ProgressProfile></LaunchScreen>;
}
