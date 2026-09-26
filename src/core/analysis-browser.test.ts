import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { readSentenceAnalysis } from './sentence-analysis';
import { syntaxFixture, syntaxPhrases } from '../test-support/syntax-fixture';

test('sentence menu opens the selected POS detail and Back returns without selecting another learning unit', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  let closes = 0, haptics = 0;
  const load = nativeModules({ react: runtime.hooks, 'react-native-reanimated': nativeMotion,
    'react-native': { ScrollView: 'ScrollView', View: 'View', Text: 'Text', Pressable: 'Pressable',
      AppState: { currentState: 'active' }, useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale: 1 }) },
    'expo-image': { Image: 'Image' }, 'expo-haptics': { ImpactFeedbackStyle: { Light: 'light' },
      impactAsync: async () => { haptics++; } }, 'expo-font': { isLoaded: () => false },
    expo: { requireOptionalNativeModule: () => null, requireNativeModule: () => ({ isEnabled: () => true }) },
    'expo-router': { usePathname: () => '/player-info',
      Stack: { Screen: 'Screen', Toolbar: Object.assign('Toolbar', { Button: 'ToolbarButton' }) } },
  });
  const { AnalysisBrowser } = load('components/analysis-browser.tsx');
  const sentences = readSentenceAnalysis(JSON.stringify(syntaxFixture()), syntaxPhrases, 'en', [0]);
  runtime.render(React.createElement(AnalysisBrowser, { sentences, onClose: () => closes++ }));
  runtime.find('문장 2 분석: Fish swim.').onPress();
  assert.equal(haptics, 1, 'Sentence selection follows normal enabled-button feedback');
  const nodes = runtime.flush();
  assert.ok(nodes.some(n => n.props.children === 'Fish swim.'));
  assert.ok(nodes.some(n => n.props.children === '명사'));
  assert.ok(nodes.some(n => n.props.children === '단어를 선택하면 연결 관계를 볼 수 있어요.'));
  runtime.find('단어 1: Fish, 명사').onPress();
  assert.equal(runtime.find('단어 1: Fish, 명사').accessibilityState.selected, true);
  assert.ok(runtime.find('swim → Fish: 주어 (NSUBJ)'));
  assert.equal(closes, 0);
  runtime.find('문장 목록으로 돌아가기').onPress();
  assert.ok(runtime.find('문장 1 분석: Birds fly.'));
  runtime.find('문장 1 분석: Birds fly.').onPress();
  assert.equal(runtime.find('단어 1: Birds, 명사').accessibilityState.selected, false);
  assert.ok(runtime.flush().some(n => n.props.children === '단어를 선택하면 연결 관계를 볼 수 있어요.'));
  runtime.find('분석 닫기').onPress();
  assert.equal(closes, 1);
});
