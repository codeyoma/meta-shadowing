import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { nativeHooks } from '../test-support/native-hooks';
import { createSession } from './session';

test('built-in font selection affects only active text, retains sizes and keeps hints inaccessible', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { Text: 'Text', View: 'View', useColorScheme: () => 'light', useWindowDimensions: () => ({ fontScale: 2 }) },
    'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player-options' }, '@/native/tap-feedback': { tapFeedback() {} },
    '@/../modules/learning-fonts': { availableLearningFonts: () => ['system', 'rounded', 'serif', 'georgia'] },
  });
  const { SpeechContent } = load('components/speech-content.tsx');
  const phrases = [{ text: 'Open the window.', translation: '창문을 여세요.', masked: true }];
  for (const view of ['bubble', 'list']) {
    const nodes = runtime.render(React.createElement(SpeechContent, { phrases, active: 0, view,
      typography: { originalTextSize: 32, translationTextSize: 18, originalTextFont: 'serif', translationTextFont: 'georgia' } }));
    const target = nodes.find(node => node.props.accessibilityLabel === 'Open')!;
    assert.equal(target.props.style.fontFamily, 'ui-serif');
    assert.equal(target.props.style.fontSize, 64);
    assert.equal(target.props.selectable, false);
    const translation = nodes.find(node => node.props.children === '창문을 여세요.')!;
    assert.equal(translation.props.style.fontFamily, 'Georgia');
    assert.equal(translation.props.style.fontSize, 36);
    const caption = nodes.find(node => node.props.children?.includes?.('현재'));
    if (caption) assert.equal(caption.props.style.fontFamily, undefined);
  }
});

test('unavailable fonts fall back without overwriting choices and silent stages keep their reveal boundaries', t => {
  const runtime = nativeHooks(); t.after(runtime.dispose);
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { Text: 'Text', View: 'View', useColorScheme: () => 'dark', useWindowDimensions: () => ({ fontScale: 3 }) },
    'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player-options' }, '@/native/tap-feedback': { tapFeedback() {} },
    '@/../modules/learning-fonts': { availableLearningFonts: () => ['system'] },
  });
  const { SpeechContent } = load('components/speech-content.tsx');
  const { WordRevealContent } = load('components/word-reveal-content.tsx');
  const phrase = { text: 'Open the window.', translation: '창문을 여세요.' };
  const preferences = Object.freeze({ originalTextSize: 48, translationTextSize: 12,
    originalTextFont: 'serif', translationTextFont: 'georgia' });
  const nodes = runtime.render(React.createElement(SpeechContent, { phrases: [phrase], active: 0, view: 'bubble', typography: preferences }));
  assert.equal(nodes.find(node => node.props.accessibilityLabel === phrase.text)!.props.style.fontFamily, 'system-ui');
  const legacy = runtime.render(React.createElement(SpeechContent, { phrases: [phrase], active: 0, view: 'bubble' }));
  assert.equal(legacy.find(node => node.props.accessibilityLabel === phrase.text)!.props.style.fontFamily, 'Nunito_800ExtraBold');
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    const state = { ...createSession({ runId: 'fonts', stage, phraseCount: 1, mode: 'manual', rate: 1 }),
      phase: 'listening' as const, audioSeconds: 0.4 };
    const before = JSON.stringify(state);
    for (const view of ['bubble', 'list']) {
      const content = runtime.render(React.createElement(WordRevealContent, { phrase, state, view, typography: preferences }));
      const lines = content.filter(node => node.props.accessibilityLabel);
      assert.equal(lines.length, stage >= 15 ? 1 : 2);
      for (const line of lines) {
        assert.equal(line.props.style.fontFamily, 'system-ui');
        assert.equal(line.props.selectable, false);
        assert.equal(line.props.allowFontScaling, false);
        assert(![phrase.text, phrase.translation].includes(line.props.accessibilityLabel));
        assert.equal(line.props.numberOfLines, undefined);
        assert.equal(line.props.adjustsFontSizeToFit, undefined);
      }
      assert.equal(JSON.stringify(state), before);
    }
  }
  assert.equal(preferences.originalTextFont, 'serif');
  assert.equal(preferences.translationTextFont, 'georgia');
});
