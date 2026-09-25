import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { nativeHooks } from '../test-support/native-hooks';
import { nativeModules, nativeMotion } from '../test-support/native-render';

test('visible words have tap and accessibility lookup without exposing hidden text or changing layout', async () => {
  const runtime = nativeHooks(), looked: string[] = [];
  const tokenize = (text: string) => Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text))
    .filter(s => s.isWordLike).map(s => ({ start: s.index, end: s.index + s.segment.length }));
  const load = nativeModules({ react: runtime.hooks,
    'expo-font': { isLoaded: () => false },
    'react-native': { Text: 'Text', useWindowDimensions: () => ({ fontScale: 1.5 }), findNodeHandle: () => 1 },
    'react-native-reanimated': { ...nativeMotion, default: { Text: 'Text' } },
    '@/../modules/learning-dictionary': { dictionary: { words: tokenize } },
  });
  const { SubtitleText } = load('components/subtitle-text.tsx');
  const props = { text: 'Open the window. Close it.', masked: true, background: 'white', color: 'black', size: 20,
    onLookup: async (term: string) => { looked.push(term); } };
  let nodes = runtime.render(React.createElement(SubtitleText, props));
  const words = nodes.filter(n => n.props.onPress);
  assert.deepEqual(words.map(n => n.props.children), ['Open', 'Close']);
  words[0]!.props.onPress();
  const parent = nodes.find(n => n.props.accessibilityActions)!;
  assert.equal(parent.props.style.fontSize, 30);
  assert.equal(parent.props.selectable, false);
  assert.equal(parent.props.accessibilityLabel, 'Open … Close');
  parent.props.onAccessibilityAction({ nativeEvent: { actionName: parent.props.accessibilityActions[1].name } });
  assert.deepEqual(looked, ['Open', 'Close']);
  nodes = runtime.render(React.createElement(SubtitleText, { ...props, masked: false }));
  const windowTap = nodes.find(n => n.props.children === 'window')!.props.onPress;
  windowTap();
  runtime.render(React.createElement(SubtitleText, props));
  windowTap(); // A callback queued before hiding the answer must not disclose it.
  assert.deepEqual(looked, ['Open', 'Close', 'window']);
  assert.equal(nodes.filter(n => typeof n.props.children === 'string').map(n => n.props.children).join(''), props.text);
  runtime.dispose();
});

test('both layouts keep grouped dialogue and translations tappable with the chosen typography', () => {
  const runtime = nativeHooks(), looked: string[] = [];
  const load = nativeModules({ react: runtime.hooks,
    'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable', useColorScheme: () => 'dark',
      useWindowDimensions: () => ({ fontScale: 2 }), findNodeHandle: () => 1 },
    'react-native-reanimated': { ...nativeMotion, default: { View: 'View', Text: 'Text' } },
    'expo-font': { isLoaded: () => true }, 'expo-image': { Image: 'Image' },
    'expo-router': { usePathname: () => '/player' }, '@/native/tap-feedback': { tapFeedback() {} },
    '@/../modules/learning-dictionary': { dictionary: { words: (text: string) =>
      Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)).filter(s => s.isWordLike)
        .map(s => ({ start: s.index, end: s.index + s.segment.length })) } },
  });
  const { SpeechContent } = load('components/speech-content.tsx');
  for (const view of ['bubble', 'list']) for (const masked of [true, false]) {
    const nodes = runtime.render(React.createElement(SpeechContent, { view, active: 1,
      phrases: [{ text: 'Other', translation: '다른' }, { text: '', translation: '', masked,
        members: [{ text: '"Hello there!" "Welcome back."', translation: '"안녕 친구!" "다시 환영해."' },
          { text: 'Open it.', translation: '문을 여세요.' }] }],
      typography: { originalTextSize: 48, translationTextSize: 12, originalTextFont: 'georgia', translationTextFont: 'serif' },
      onLookup: async (term: string) => { looked.push(term); },
    }));
    const words = nodes.filter(n => n.props.onPress && n.type === 'Text').map(n => n.props.children);
    assert(words.includes('Hello') && words.includes('Welcome') && words.includes('Open'));
    assert.equal(words.includes('there'), !masked);
    assert(words.includes('친구') && words.includes('문을'));
    assert(!words.includes('Other'));
    assert(nodes.some(n => n.props.style?.fontSize === 96 && n.props.style.fontFamily === 'Georgia'));
    assert(nodes.some(n => n.props.style?.fontSize === 24 && n.props.style.fontFamily === 'ui-serif'));
    nodes.find(n => n.props.children === '문을')!.props.onPress();
  }
  assert.equal(looked.length, 4);
  runtime.dispose();
});
