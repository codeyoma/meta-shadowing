import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { palettes } from '../components/theme';

test('learning guide uses the full-height menu sheet in both themes and closes without changing the stage', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  let scheme = 'light', closes = 0;
  const params = { kind: 'guide', stage: '7', package: 'guide-test-v1' };
  const load = nativeModules({ react: runtime.hooks, 'react-native-reanimated': nativeMotion,
    'react-native': { View: 'View', ScrollView: 'ScrollView', Text: 'Text', Pressable: 'Pressable',
      PlatformColor: (name: string) => name, useColorScheme: () => scheme,
      useWindowDimensions: () => ({ fontScale: 1 }) },
    'expo-router': { useLocalSearchParams: () => params, usePathname: () => '/player-info',
      router: { back: () => closes++ },
      Stack: { Screen: 'Screen', Toolbar: Object.assign('Toolbar', { Button: 'ToolbarButton' }) } },
    'expo-router/react-navigation': { useHeaderHeight: () => 56 },
    '@/native/catalog': { selectedPackage: () => ({ packageKey: params.package }) },
    'expo-image': { Image: 'Image' }, 'expo-font': { isLoaded: () => false },
    'expo-haptics': {}, expo: { requireOptionalNativeModule: () => null, requireNativeModule: () => ({}) },
  });
  const { LearningGuide } = load('components/learning-guide.tsx');
  runtime.render(React.createElement(LearningGuide));
  for (const theme of ['light', 'dark']) {
    scheme = theme;
    const nodes = runtime.flush();
    const options = nodes.find(n => n.type === 'Screen')!.props.options;
    assert.deepEqual(Array.from(options.sheetAllowedDetents ?? []), [1], 'Guide fills the sheet like learning options');
    assert.equal(options.headerTransparent, true);
    assert.equal(options.contentStyle.backgroundColor, theme === 'light' ? '#f2f3f5' : palettes.dark.background);
    assert.ok(nodes.some(n => n.props.pointerEvents === 'none'), 'Decorative outline cannot block header gestures');
    assert.ok(nodes.some(n => n.props.style?.backgroundColor === (theme === 'light' ? '#ffffff' : palettes.dark.card)
      && n.props.style?.borderRadius === 24), 'Guide content uses the regular menu group treatment');
    assert.ok(nodes.some(n => React.Children.toArray(n.props.children).join('') === '메타쉐도잉 Lv 4'));
    assert.ok(nodes.some(n => typeof n.props.children === 'string' && n.props.children.startsWith('설정한 2–4개')),
      'Grouped-stage guidance remains visible');
  }
  runtime.find('학습 가이드 닫기').onPress();
  assert.equal(closes, 1);
  assert.equal(params.stage, '7');
  params.stage = '999';
  assert.ok(runtime.flush().some(n => n.props.children === '학습 정보를 열 수 없어요.'));
  runtime.find('학습 가이드 닫기').onPress();
  assert.equal(closes, 2, 'Unavailable guidance remains dismissible');
});
