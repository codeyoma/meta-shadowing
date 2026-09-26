import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { readSentenceAnalysis } from './sentence-analysis';
import { syntaxFixture, syntaxPhrases } from '../test-support/syntax-fixture';
import { palettes } from '../components/theme';
import { nativeOptionsStack } from '../test-support/native-options-stack';

test('sentence menu opens the selected POS detail and Back returns without selecting another learning unit', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  let closes = 0, haptics = 0, fontScale = 1, reduced = false;
  const load = nativeModules({ react: runtime.hooks, 'react-native-reanimated': { ...nativeMotion, useReducedMotion: () => reduced },
    'expo-router/native-stack': nativeOptionsStack(runtime.hooks),
    'expo-router/react-navigation': { useIsFocused: () => true },
    'react-native': { ScrollView: 'ScrollView', View: 'View', Text: 'Text', Pressable: 'Pressable',
      AppState: { currentState: 'active' }, useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale }) },
    'expo-image': { Image: 'Image' }, 'expo-haptics': { ImpactFeedbackStyle: { Light: 'light' },
      impactAsync: async () => { haptics++; } }, 'expo-font': { isLoaded: () => false },
    expo: { requireOptionalNativeModule: () => null, requireNativeModule: () => ({ isEnabled: () => true }) },
    'expo-router': { usePathname: () => '/player-info',
      Stack: { Screen: 'Screen', Toolbar: Object.assign('Toolbar', { Button: 'ToolbarButton' }) } },
  });
  const { AnalysisBrowser } = load('components/analysis-browser.tsx');
  const sentences = readSentenceAnalysis(JSON.stringify(syntaxFixture()), syntaxPhrases, 'en', [0]);
  runtime.render(React.createElement(AnalysisBrowser, { sentences, onClose: () => closes++ }));
  assert.equal(runtime.flush().some(n => n.props.children === '분석할 문장을 선택하세요.'), false);
  const stack = () => runtime.flush().find(n => n.type === 'NativeOptionsStack')!.props;
  assert.equal(stack().screenOptions.animation, 'default');
  assert.equal(stack().screenOptions.headerShown, false, 'Only the outer sheet header is displayed');
  runtime.find('문장 2 분석: Fish swim.').onPress();
  assert.equal(haptics, 1, 'Sentence selection follows normal enabled-button feedback');
  assert.equal(stack().navigation.getState().index, 1, 'Selecting a sentence pushes a native detail screen');
  const nodes = runtime.flush();
  assert.ok(nodes.some(n => n.props.children === 'Fish swim.'));
  assert.ok(nodes.some(n => n.props.children === '명사'));
  assert.ok(nodes.some(n => n.props.children === 'noun'));
  assert.ok(nodes.some(n => n.props.children === 'verb'));
  const directionIndex = nodes.findIndex(n => n.props.children === '화살표는 역할을 하는 단어에서 연결된 중심어를 향해요.');
  assert.ok(directionIndex >= 0 && directionIndex < nodes.findIndex(n => n.props.accessibilityLabel === '문장 관계 그래프'));
  assert.equal(nodes.some(n => String(n.props.children).includes('좌우로 밀어')), false);
  assert.ok(nodes.some(n => n.props.children === '단어를 선택하면 연결 관계를 볼 수 있어요.'));
  assert.equal(nodes.some(n => /^단어 \d+$/.test(String(n.props.children))), false);
  const thumb = () => runtime.flush().find(n => n.props.testID === 'sentence-graph-scroll-thumb');
  assert.equal(thumb(), undefined, 'No scroll indicator before overflow is measured');
  runtime.find('문장 관계 그래프').onLayout({ nativeEvent: { layout: { width: 300 } } });
  runtime.find('문장 관계 그래프').onContentSizeChange(900, 200);
  assert.equal(thumb()!.props.style.width, 100);
  assert.equal(thumb()!.props.style.transform[0].translateX, 0);
  runtime.find('문장 관계 그래프').onScroll({ nativeEvent: { contentOffset: { x: 300 } } });
  assert.equal(thumb()!.props.style.transform[0].translateX, 100);
  runtime.find('문장 관계 그래프').onScroll({ nativeEvent: { contentOffset: { x: 700 } } });
  assert.equal(thumb()!.props.style.transform[0].translateX, 200, 'Bounce cannot move the thumb past the track');
  runtime.find('문장 관계 그래프').onLayout({ nativeEvent: { layout: { width: 600 } } });
  assert.equal(thumb()!.props.style.width, 400, 'Indicator follows viewport changes');
  runtime.find('문장 관계 그래프').onContentSizeChange(500, 200);
  assert.equal(thumb(), undefined, 'No indicator when the full graph fits');
  runtime.find('문장 관계 그래프').onContentSizeChange(900, 200);
  for (const [index, label] of ['단어 1: Fish, 명사', '단어 2: swim, 동사', '단어 3: ., 문장 부호'].entries()) {
    runtime.find(label).onLayout({ nativeEvent: { layout: { x: index * 90, width: 78 } } });
  }
  const curves = () => runtime.flush().filter(n => n.type === 'Image' && n.props.source?.uri?.startsWith('data:image/svg+xml'));
  assert.equal(curves().length, 2, 'All non-root arrows are visible before selection');
  assert.ok(curves().every(n => n.props.style.opacity === 1));
  const endpoints = () => curves().map(n => {
    const path = decodeURIComponent(n.props.source.uri).match(/<path d="M ([\d.e+-]+) ([\d.e+-]+) Q ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)"/)!;
    assert.ok(path, 'Each displayed curve has a quadratic path');
    return [n.props.style.left + Number(path[1]), n.props.style.left + Number(path[5])];
  });
  const overviewEndpoints = endpoints();
  assert.deepEqual(overviewEndpoints, [[39, 98], [219, 160]], 'Dependent words point to distinct ports on their head');
  const ends = overviewEndpoints.map(p => p[1]!).sort((a, b) => a - b);
  assert.ok(ends[1]! - ends[0]! >= 12, 'Shared head uses visibly separated attachment points');
  assert.ok(ends.every(x => x > 90 && x < 168), 'Attachments remain inside the measured word control');
  runtime.find('단어 1: Fish, 명사').onPress();
  assert.equal(runtime.find('단어 1: Fish, 명사').accessibilityState.selected, true);
  assert.ok(runtime.find('Fish → swim: 주어 (nsubj)'));
  assert.equal(runtime.flush().find(n => n.type === 'Text' && n.props.children === 'Fish')!.props.style.color, palettes.dark.accent);
  assert.equal(runtime.flush().find(n => n.type === 'Text' && n.props.children === 'swim')!.props.style.color, palettes.dark.link);
  assert.equal(runtime.flush().some(n => String(n.props.children).includes(' · 연결 관계')), false);
  assert.ok(thumb(), 'Scroll position remains visible while idle and selecting words');
  assert.ok(runtime.flush().some(n => n.props.children === '화살표는 역할을 하는 단어에서 연결된 중심어를 향해요.'));
  assert.equal(curves().length, 2, 'Unrelated arrows remain visible after selection');
  assert.equal(curves().filter(n => n.props.style.opacity < 1).length, 1);
  assert.deepEqual(endpoints(), overviewEndpoints, 'Selection changes emphasis, not arrow attachment positions');
  runtime.find('단어 1: Fish, 명사').onPress();
  assert.equal(runtime.find('단어 1: Fish, 명사').accessibilityState.selected, false);
  assert.equal(runtime.flush().find(n => n.type === 'Text' && n.props.children === 'Fish')!.props.style.color, palettes.dark.text);
  assert.ok(curves().every(n => n.props.style.opacity === 1), 'Tapping again restores the overview');
  runtime.find('단어 2: swim, 동사').onPress();
  assert.ok(runtime.flush().some(n => n.props.children === '문장의 중심어 (root)입니다.'));
  assert.equal(runtime.flush().some(n => String(n.props.children).includes('자기 자신을 향한')), false);
  runtime.find('단어 2: swim, 동사').onPress();
  for (fontScale of [1, 1.5, 3]) {
    assert.ok(curves().every(n => n.props.style.top >= 24 * fontScale),
      `Curves reserve upper label clearance at font scale ${fontScale}`);
  }
  fontScale = 1;
  assert.equal(closes, 0);
  runtime.find('문장 목록으로 돌아가기').onPress();
  assert.equal(stack().navigation.getState().index, 0);
  assert.ok(runtime.find('문장 1 분석: Birds fly.'));
  runtime.find('문장 1 분석: Birds fly.').onPress();
  assert.equal(runtime.find('단어 1: Birds, 명사').accessibilityState.selected, false);
  assert.ok(runtime.flush().some(n => n.props.children === '단어를 선택하면 연결 관계를 볼 수 있어요.'));
  stack().navigation.popToTop(); runtime.flush();
  assert.equal(runtime.find('문장 목록으로 돌아가기').hidden, true, 'Native back also updates the outer header');
  reduced = true;
  assert.equal(stack().screenOptions.animation, 'fade');
  runtime.find('문장 1 분석: Birds fly.').onPress();
  runtime.find('분석 닫기').onPress();
  assert.equal(closes, 1);
});
