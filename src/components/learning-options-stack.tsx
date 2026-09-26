import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createNativeStackNavigator, type NativeStackNavigationProp } from 'expo-router/native-stack';
import { useIsFocused } from 'expo-router/react-navigation';
import { useReducedMotion } from 'react-native-reanimated';
import type { LearningPreference } from './learning-preference-section';

export type LearningOptionsPage = LearningPreference | 'sentences' | 'reveal' | 'monitor';
type Routes = Record<LearningOptionsPage | 'menu', undefined>;
export type LearningOptionsNavigation = Pick<NativeStackNavigationProp<Routes, 'menu'>,
  'navigate' | 'popToTop' | 'replace' | 'getState'>;
const OptionsStack = createNativeStackNavigator<Routes>();
const pages: (keyof Routes)[] = ['menu', 'sentences', 'display', 'typography', 'rate', 'group', 'wpm', 'reveal', 'monitor'];

/** Native push/pop for the sheet body; the parent retains its header, footer and learning authority. */
export function LearningOptionsStack({ initialPage, navigationRef, onPageChange, backgroundColor, children }: {
  initialPage: LearningOptionsPage | null;
  navigationRef: RefObject<LearningOptionsNavigation | null>;
  onPageChange(page: LearningOptionsPage | null): void;
  backgroundColor: string;
  children(page: LearningOptionsPage | null): ReactNode;
}) {
  const initialRoute = useRef<keyof Routes>(initialPage ?? 'menu');
  const reduced = useReducedMotion();
  useEffect(() => () => { navigationRef.current = null; }, [navigationRef]);
  return <OptionsStack.Navigator initialRouteName={initialRoute.current}
    screenOptions={{ headerShown: false, animation: reduced ? 'fade' : 'default',
      animationTypeForReplace: 'pop', contentStyle: { backgroundColor } }}>
    {pages.map(page => <OptionsStack.Screen key={page} name={page}>
      {({ navigation }) => <OptionsPageHost navigation={navigation} navigationRef={navigationRef}
        page={page === 'menu' ? null : page} onPageChange={onPageChange}>
        {children(page === 'menu' ? null : page)}
      </OptionsPageHost>}
    </OptionsStack.Screen>)}
  </OptionsStack.Navigator>;
}

function OptionsPageHost({ navigation, navigationRef, page, onPageChange, children }: {
  navigation: LearningOptionsNavigation;
  navigationRef: RefObject<LearningOptionsNavigation | null>;
  page: LearningOptionsPage | null;
  onPageChange(page: LearningOptionsPage | null): void;
  children: ReactNode;
}) {
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (!focused) return;
    navigationRef.current = navigation;
    onPageChange(page);
  }, [focused, navigation, navigationRef, page, onPageChange]);
  return children;
}

export function backToLearningOptions(navigation: LearningOptionsNavigation | null) {
  if (!navigation) return;
  // A directly opened speed editor has no local predecessor; do not pop the parent sheet.
  if (navigation.getState().index > 0) navigation.popToTop();
  else navigation.replace('menu');
}
