import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeFontMenu, nativeFontMenuModifiers } from '../test-support/native-font-menu';
import type { Settings } from './settings';

test('font taps update independent previews immediately; reset preserves sizes and failures preserve accepted choices', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', StyleSheet: { hairlineWidth: 1 },
      PlatformColor: (name: string) => name, useColorScheme: () => 'light', useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player-options' }, '@/native/tap-feedback': { tapFeedback() {} },
    '@/../modules/learning-fonts': { availableLearningFonts: () => ['system', 'rounded', 'serif', 'georgia'] },
    '@expo/ui/swift-ui': nativeFontMenu,
    '@expo/ui/swift-ui/modifiers': nativeFontMenuModifiers,
  });
  const { LearningTypographyControl } = load('components/learning-typography-control.tsx');
  let saved: Settings = { mode: 'manual', rate: 1.25, groupSize: 4, originalTextSize: 32, translationTextSize: 18 };
  let fail = false;
  function Editor() {
    const [settings, setSettings] = runtime.hooks.useState(saved);
    return React.createElement(LearningTypographyControl, { settings, onChange(patch: Partial<Settings>) {
      if (fail) return false;
      saved = { ...saved, ...patch }; setSettings(saved); return true;
    } });
  }
  const output = runtime.render(React.createElement(Editor));
  assert.equal(output.filter(node => node.type === 'NativeMenu').length, 2, 'Each language has one popup selector, not an expanded font list');
  runtime.find('원문 폰트 선택, 현재 System');
  runtime.find('번역 폰트 선택, 현재 System');
  assert.equal(saved.originalTextFont, undefined, 'Opening preserves legacy appearance');
  assert(!output.some(node => node.props.accessibilityLabel === '원문 폰트: Avenir Next'), 'Unsupported choices are not offered');
  runtime.find('원문 폰트: System').onPress();
  assert.equal(saved.originalTextFont, 'system', 'System is explicitly selectable even from legacy appearance');
  runtime.find('원문 폰트: Serif').onPress();
  runtime.find('번역 폰트: Georgia').onPress();
  assert.equal(saved.originalTextFont, 'serif');
  assert.equal(saved.translationTextFont, 'georgia');
  const preview = runtime.flush().find(node => node.props.children === 'A little practice every day helps me speak clearly and feel more confident.')!;
  assert.equal(preview.props.style.fontFamily, 'ui-serif');
  assert.equal(preview.props.style.fontSize, 32);
  assert.equal(runtime.find('원문 폰트: Serif').systemImage, 'checkmark');
  runtime.find('원문 폰트 선택, 현재 Serif');
  runtime.find('번역 폰트 선택, 현재 Georgia');
  fail = true;
  runtime.find('원문 폰트: Rounded').onPress();
  assert.equal(runtime.find('원문 폰트: Serif').systemImage, 'checkmark');
  runtime.find('원문 폰트 선택, 현재 Serif');
  fail = false;
  runtime.find('폰트 초기화').onPress();
  assert.deepEqual(saved, { mode: 'manual', rate: 1.25, groupSize: 4, originalTextSize: 32, translationTextSize: 18,
    originalTextFont: 'system', translationTextFont: 'system' });
  assert(!runtime.flush().some(node => ['저장', '적용', 'Save', 'Apply'].includes(node.props.accessibilityLabel)));
  saved = { ...saved, originalTextFont: 'avenir-next' };
  runtime.render(null); runtime.render(React.createElement(Editor));
  assert.equal(saved.originalTextFont, 'avenir-next');
  assert(runtime.flush().some(node => String(node.props.children).includes('Avenir Next · System으로 표시')));
});
