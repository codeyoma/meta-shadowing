import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { DatabaseSync } from 'node:sqlite';
import { ProgressProfiles, ProgressSync } from './progress-sync';
import type { ProgressCloud } from '../../modules/progress-cloud';
import manifest from '../../assets/sample/manifest.json';
import { createSession, createGroupedSession } from './session';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { nativeHooks } from '../test-support/native-hooks';

test('size buttons and completed input apply immediately, independently, and retain the last rapid change', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', StyleSheet: { hairlineWidth: 1 }, PlatformColor: (name: string) => name,
      useColorScheme: () => 'light', useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player-options' }, '@/native/tap-feedback': { tapFeedback() {} },
    '@react-native-community/slider': { __esModule: true, default: 'Slider' },
    '@expo/ui/swift-ui': { Host: 'Host', Picker: 'Picker', Text: 'Text' },
    '@expo/ui/swift-ui/modifiers': { pickerStyle: () => ({}), tag: () => ({}) },
  });
  const { LearningPreferenceSection } = load('components/learning-preference-section.tsx');
  let saved = { originalTextSize: 20, translationTextSize: 18 };
  const changes: unknown[] = [];
  const onChange = (patch: Partial<typeof saved>) => { saved = { ...saved, ...patch }; changes.push(patch); return true; };
  runtime.render(React.createElement(LearningPreferenceSection, { option: 'display', settings: saved, onChange }));
  const content = runtime.flush();
  const fontHeading = content.findIndex(node => node.props.children === '폰트 설정');
  const originalLabel = content.findIndex(node => node.props.children === '원문 폰트 크기');
  assert(fontHeading >= 0 && fontHeading < originalLabel, 'Font settings has its own heading before the controls');
  assert(!content.some(node => node.props.children === '미리보기'), 'The sample card has no preview heading');
  const originalPreview = content.findIndex(node => node.props.children === 'A little practice every day helps me speak clearly and feel more confident.');
  const translationPreview = content.findIndex(node => node.props.children === '매일 조금씩 연습하면 더 또렷하고 자신 있게 말할 수 있어요.');
  const resetControl = content.findIndex(node => node.props.accessibilityLabel === '폰트 크기 초기화');
  assert(originalPreview >= 0 && translationPreview > originalPreview, 'The preview includes the longer bilingual sample');
  assert(resetControl > translationPreview, 'Font-size reset follows the complete preview');
  assert.equal(content[resetControl]?.props.accessibilityRole, 'button');
  assert(content.some(node => node.props.source === 'sf:arrow.counterclockwise'), 'The reset action has a reset icon');
  const plus = runtime.find('원문 폰트 크기 늘리기').onPress;
  plus(); plus(); plus();
  assert.equal(saved.originalTextSize, 23);
  assert.equal(saved.translationTextSize, 18);
  runtime.find('번역 폰트 크기').onChangeText('32');
  assert.equal(saved.translationTextSize, 18, 'Keystrokes remain a draft until input completes');
  runtime.find('번역 폰트 크기').onEndEditing();
  assert.equal(saved.translationTextSize, 32);
  assert.equal(changes.length, 4);
  for (const sequence of [[''], ['1', '12', '120'], ['4', '49'], ['2', '20', '20.', '20.5'], ['abc']]) {
    for (const text of sequence) runtime.find('번역 폰트 크기').onChangeText(text);
    runtime.find('번역 폰트 크기').onEndEditing();
  }
  assert.equal(saved.translationTextSize, 32);
  runtime.find('번역 폰트 크기').onEndEditing();
  assert.equal(runtime.find('번역 폰트 크기').value, '32');
});

test('both real settings routes save immediately, share updates, reset, and recover from local failures', async t => {
  const runtime = nativeHooks();
  const db = new DatabaseSync(':memory:');
  let fail = false;
  const profiles = new ProgressProfiles(() => ({
    exec(sql) { if (fail && sql === 'BEGIN IMMEDIATE') throw Error('Disk full.'); db.exec(sql); },
    run(sql, ...args) { db.prepare(sql).run(...args); },
    first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T | undefined,
    all: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[],
  }), () => 'profile');
  const sync = new ProgressSync(profiles, { stop: async () => {} } as ProgressCloud);
  t.after(() => { runtime.dispose(); sync.dispose(); db.close(); });
  profiles.saveValue('settings', JSON.stringify({ mode: 'manual', rate: 1.25, groupSize: 4 }));
  const alerts: string[] = [];
  let params: Record<string, string> = { option: 'display' };
  const pack = { owned: true, packageKey: `${manifest.id}-v${manifest.version}`, manifest, language: 'english' };
  let appState = 'active', focusEntries = 0;
  const navigation = { addListener: () => () => {}, isFocused: () => true };
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
      Alert: { alert: (title: string) => alerts.push(title) },
      AppState: { get currentState() { return appState; }, addEventListener: () => ({ remove() {} }) },
      StyleSheet: { hairlineWidth: 1 }, PlatformColor: (name: string) => name,
      useColorScheme: () => 'light', useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player-options', useLocalSearchParams: () => params,
      useFocusEffect: (callback: () => any) => runtime.hooks.useEffect(() => { focusEntries++; return callback(); }, [callback]),
      useNavigation: () => navigation,
      Stack: { Screen: 'Screen' }, router: { back() {} } },
    'expo-router/react-navigation': { useHeaderHeight: () => 50, useNavigationState: () => null, useIsFocused: () => true },
    expo: { requireNativeView: () => 'Video' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-crypto': { randomUUID: () => 'test-id' },
    '@/native/progress-sync': { getProgressSync: () => sync, startProgressSync: () => () => {} },
    '@/native/catalog': { selectedPackage: () => pack },
    '@/native/package': { isInstalled: async () => true },
    '@/native/package-availability': {},
    '@/native/paid-package': { isPaidDuo: () => false, mayUsePackage: () => true },
    '@/native/stage-access': { testStageAccess: async () => true }, '@/native/voice-monitor': { learningMonitorSupported: false },
    '@/native/audio': { nativeAudio: () => ({ prepare: async () => {}, play() {}, pause() {}, position: () => 1.5, dispose() {} }) },
    '@/native/video': {}, '@/../modules/learning-audio': { __esModule: true, default: null },
    '@/native/tap-feedback': { tapFeedback() {}, prepareLearningHaptics() {}, stopLearningHaptics() {} },
    '@react-native-community/slider': { __esModule: true, default: 'Slider' },
    '@expo/ui/swift-ui': { Host: 'Host', Picker: 'Picker', Text: 'Text' },
    '@expo/ui/swift-ui/modifiers': { pickerStyle: () => ({}), tag: () => ({}) },
  });
  const settings = load('native/settings.ts') as typeof import('../native/settings');
  const SettingsScreen = load('app/(tabs)/settings/learning-detail.tsx').default;
  const OptionsScreen = load('app/player-options.tsx').default;
  runtime.render(React.createElement(SettingsScreen));
  assert.equal(settings.readSettings().originalTextSize, undefined, 'Opening the editor does not migrate legacy appearance');
  runtime.find('원문 폰트 크기 늘리기').onPress();
  assert.equal(settings.readSettings().originalTextSize, 21);
  assert.equal(runtime.find('원문 폰트 크기').value, '21');
  const plus = runtime.find('번역 폰트 크기 늘리기').onPress;
  plus(); plus(); plus();
  assert.equal(settings.readSettings().translationTextSize, 21);
  assert.equal(settings.readSettings().rate, 1.25);
  assert.equal(settings.readSettings().groupSize, 4);
  runtime.find('원문 폰트: Serif').onPress();
  runtime.find('번역 폰트: Apple SD Gothic Neo').onPress();
  assert.equal(settings.readSettings().originalTextFont, 'serif');
  assert.equal(settings.readSettings().translationTextFont, 'apple-sd-gothic-neo');

  runtime.render(null);
  params = { profile: 'guest', authority: '0' };
  runtime.render(React.createElement(OptionsScreen));
  await new Promise(resolve => setImmediate(resolve));
  runtime.find('학습 화면').onPress();
  assert.equal(runtime.find('원문 폰트: Serif').accessibilityState.checked, true);
  runtime.find('원문 폰트: Rounded').onPress();
  runtime.find('원문 폰트: Georgia').onPress();
  assert.equal(settings.readSettings().originalTextFont, 'georgia');
  assert.equal(runtime.find('원문 폰트 크기').value, '21');
  runtime.find('원문 폰트 크기').onChangeText('48');
  assert.equal(runtime.find('원문 폰트 크기 늘리기').disabled, true, 'Bounds follow a valid draft before completion too');
  runtime.find('원문 폰트 크기').onEndEditing();
  assert.equal(settings.readSettings().originalTextSize, 48);
  assert.equal(runtime.find('원문 폰트 크기 늘리기').disabled, true);
  runtime.find('원문 폰트 크기').onChangeText('20');
  assert.equal(runtime.find('원문 폰트 크기 늘리기').disabled, false);
  runtime.find('원문 폰트 크기 늘리기').onPress();
  assert.equal(settings.readSettings().originalTextSize, 21);
  runtime.find('번역 폰트 크기').onChangeText('12');
  assert.equal(runtime.find('번역 폰트 크기 줄이기').disabled, true);
  runtime.find('번역 폰트 크기').onEndEditing();
  assert.equal(runtime.find('번역 폰트 크기 줄이기').disabled, true);
  fail = true;
  runtime.find('원문 폰트: System').onPress();
  assert.equal(settings.readSettings().originalTextFont, 'georgia');
  assert.equal(runtime.find('원문 폰트: Georgia').accessibilityState.checked, true);
  runtime.find('번역 폰트 크기 늘리기').onPress();
  assert.equal(runtime.find('번역 폰트 크기').value, '12');
  assert.equal(settings.readSettings().translationTextSize, 12);
  assert.deepEqual(alerts, ['설정을 저장하지 못했어요', '설정을 저장하지 못했어요']);
  fail = false;
  runtime.find('폰트 크기 초기화').onPress();
  assert.equal(runtime.find('원문 폰트 크기').value, '20');
  assert.equal(runtime.find('번역 폰트 크기').value, '18');
  runtime.render(null);
  params = { option: 'display' };
  runtime.render(React.createElement(SettingsScreen));
  assert.equal(runtime.find('원문 폰트: Georgia').accessibilityState.checked, true);
  runtime.find('폰트 초기화').onPress();
  assert.equal(settings.readSettings().originalTextFont, 'system');
  assert.equal(settings.readSettings().translationTextFont, 'system');
  assert.equal(runtime.find('원문 폰트 크기').value, '20');
  settings.saveSettings({ ...settings.readSettings(), originalTextSize: 35 }, 'guest', 0);
  assert.equal(runtime.find('원문 폰트 크기').value, '35', 'An already open editor follows external updates');
  assert.equal(alerts.length, 2, 'Successful saves are quiet');

  // Keep the real route, subscription, player, journal and rendering mounted.
  // Only navigation/native playback boundaries are fixtures.
  const PlayerScreen = load('app/player.tsx').default;
  const { ProgressProfile } = load('components/progress-profile.tsx');
  appState = 'background'; // Start paused; no elapsed timer/automatic entry alters the comparison.
  for (const stage of [1, 7, 11, 15] as const) {
    runtime.render(null);
    const input = { runId: `mounted-${stage}`, stage, mode: 'manual' as const, rate: 1.25 };
    const checkpoint = { ...(stage === 7
      ? createGroupedSession({ ...input, sourcePhraseCount: manifest.phrases.length, groupSize: 4 })
      : createSession({ ...input, phraseCount: manifest.phrases.length })), phase: 'listening' as const, audioSeconds: 1.5 };
    profiles.current().journal.save(pack.packageKey, checkpoint, { language: 'english', book: manifest.id });
    params = { stage: String(stage), package: pack.packageKey };
    runtime.render(React.createElement(ProgressProfile, null, React.createElement(PlayerScreen)));
    await new Promise(resolve => setImmediate(resolve));
    runtime.flush();
    const entries = focusEntries;
    settings.saveSettings({ ...settings.readSettings(), originalTextSize: 48, translationTextSize: 48,
      originalTextFont: 'serif', translationTextFont: 'georgia' }, 'guest', 0);
    const output = runtime.flush();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(focusEntries, entries, `Stage ${stage} typography must not restart the focus/engine effect`);
    assert.deepEqual(profiles.current().journal.load(pack.packageKey, stage, manifest.phrases.length), checkpoint);
    assert(output.some(node => node.props.style?.fontSize === 48), `Stage ${stage} mounted text updates`);
    assert(output.some(node => node.props.style?.fontFamily === 'Georgia'), `Stage ${stage} mounted font updates`);
    assert.equal(alerts.length, 2);
    settings.saveSettings({ ...settings.readSettings(), originalTextSize: 20, translationTextSize: 18 }, 'guest', 0);
  }
});
