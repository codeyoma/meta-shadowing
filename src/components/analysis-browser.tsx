import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PlatformColor, ScrollView, View } from 'react-native';
import { FeedbackPressable as Pressable } from './feedback-pressable';
import { Stack } from 'expo-router';
import { createNativeStackNavigator, type NativeStackNavigationProp } from 'expo-router/native-stack';
import { useHeaderHeight, useIsFocused } from 'expo-router/react-navigation';
import { useReducedMotion } from 'react-native-reanimated';
import { Icon, Label } from './ui';
import { useSettingsColors } from './settings-row';
import type { AnalysisSentence } from '@/core/sentence-analysis';
import { SentenceRelationGraph } from './sentence-relation-graph';

type Routes = { list: undefined; detail: { id: string } };
type Navigation = Pick<NativeStackNavigationProp<Routes>, 'popToTop'>;
const AnalysisStack = createNativeStackNavigator<Routes>();

export function AnalysisBrowser({ sentences, onClose }: {
  sentences: readonly AnalysisSentence[]; onClose(): void;
}) {
  const c = useSettingsColors();
  const headerHeight = useHeaderHeight();
  const [selected, setSelected] = useState<string | null>(null);
  const navigationRef = useRef<Navigation | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => () => { navigationRef.current = null; }, []);
  const sentence = sentences.find(s => s.id === selected);
  return <View style={{ flex: 1, backgroundColor: c.sheet }}>
    <View collapsable={false} style={{ flex: 1, paddingTop: headerHeight }}>
    <AnalysisStack.Navigator initialRouteName="list" screenOptions={{ headerShown: false,
      animation: reduced ? 'fade' : 'default', contentStyle: { backgroundColor: c.sheet } }}>
      <AnalysisStack.Screen name="list">{({ navigation }) => <AnalysisPage navigation={navigation}
        navigationRef={navigationRef} selected={null} onFocus={setSelected}>
        {sentences.map((item, index) => <Pressable key={item.id} accessibilityRole="button"
          accessibilityLabel={`문장 ${index + 1} 분석: ${item.text}`} onPress={() => navigation.navigate('detail', { id: item.id })}
          style={({ pressed }) => ({ backgroundColor: pressed ? c.pressed : c.group, borderRadius: 24,
            borderCurve: 'continuous', padding: 20, minHeight: 52, flexDirection: 'row', gap: 12, alignItems: 'center' })}>
          <View style={{ flex: 1, gap: 6 }}><Label size={13} muted>{`문장 ${index + 1}`}</Label>
            <Label>{item.text}</Label></View><Icon name="chevron.right" size={16} />
        </Pressable>)}
      </AnalysisPage>}</AnalysisStack.Screen>
      <AnalysisStack.Screen name="detail">{({ navigation, route }) => {
        const detail = sentences.find(item => item.id === route.params.id);
        return <AnalysisPage navigation={navigation} navigationRef={navigationRef} selected={route.params.id} onFocus={setSelected}>
          {detail ? <AnalysisDetail key={`${detail.id}:${detail.text}`} sentence={detail} />
            : <Label muted>문장 분석을 사용할 수 없어요.</Label>}
        </AnalysisPage>;
      }}</AnalysisStack.Screen>
    </AnalysisStack.Navigator>
    </View>
    <View pointerEvents="none" accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, overflow: 'hidden' }}>
      <View style={{ height: 64, borderRadius: 32, borderWidth: 1, borderColor: PlatformColor('systemGray3') }} />
    </View>
    <Stack.Screen options={{ title: '문장 분석', headerTransparent: true, headerBlurEffect: 'none',
      headerStyle: { backgroundColor: 'transparent' },
      contentStyle: { backgroundColor: c.sheet },
      sheetAllowedDetents: [1], sheetCornerRadius: 32 }} />
    <Stack.Toolbar placement="left"><Stack.Toolbar.Button icon="chevron.left" hidden={!sentence}
      accessibilityLabel="문장 목록으로 돌아가기" onPress={() => navigationRef.current?.popToTop()} /></Stack.Toolbar>
    <Stack.Toolbar placement="right"><Stack.Toolbar.Button icon="xmark"
      accessibilityLabel="분석 닫기" onPress={onClose} /></Stack.Toolbar>
  </View>;
}

function AnalysisDetail({ sentence }: { sentence: AnalysisSentence }) {
  const active = useIsFocused();
  return <SentenceRelationGraph sentence={sentence} active={active} />;
}

/** Synchronize the parent sheet header after both button and native gesture navigation. */
function AnalysisPage({ navigation, navigationRef, selected, onFocus, children }: {
  navigation: Navigation; navigationRef: RefObject<Navigation | null>;
  selected: string | null; onFocus(id: string | null): void; children: ReactNode;
}) {
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (!focused) return;
    navigationRef.current = navigation;
    onFocus(selected);
  }, [focused, navigation, navigationRef, selected, onFocus]);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16 }}>
    {children}
  </ScrollView>;
}
