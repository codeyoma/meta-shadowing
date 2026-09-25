import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nativeModules, nativeMotion, nativeText, nativeView } from '../test-support/native-render';
import { createSession } from './session';

const load = nativeModules({
  'react-native': { Text: nativeText, View: nativeView, Pressable: nativeView,
    useWindowDimensions: () => ({ fontScale: 2 }), useColorScheme: () => 'light' },
  'react-native-reanimated': nativeMotion, 'expo-font': { isLoaded: () => true }, 'expo-image': { Image: nativeView },
  'expo-router': { usePathname: () => '/player-options' },
  '@/native/tap-feedback': { tapFeedback() {} },
});
const { SpeechContent } = load('components/speech-content.tsx');
const { WordRevealContent } = load('components/word-reveal-content.tsx');
const phrases = [{ text: 'Open the window.', translation: '창문을 여세요.' }];

test('custom original and translation sizes apply once in both layouts without changing the unit label', () => {
  for (const view of ['bubble', 'list']) {
    const html = renderToStaticMarkup(React.createElement(SpeechContent, { phrases, active: 0, view,
      textSizes: { originalTextSize: 32, translationTextSize: 21 } }));
    assert.match(html, /data-size="64"/);
    assert.match(html, /data-size="42"/);
    assert.match(html, /data-scaling="false"/);
    if (view === 'list') assert.match(html, /data-size="26"[^>]*>1 · 현재 학습 구간/);
  }
});

test('silent stages use chosen sizes while retaining their reveal order, hidden words, and timeline', () => {
  for (const stage of [11, 12, 13, 14, 15, 16] as const) {
    const state = { ...createSession({ runId: 'sizes', stage, phraseCount: 1, rate: 1, mode: 'manual' }),
      phase: 'listening' as const, audioSeconds: 0.4 };
    const before = JSON.stringify(state);
    for (const view of ['bubble', 'list']) {
      const html = renderToStaticMarkup(React.createElement(WordRevealContent, { state, view, phrase: phrases[0],
        textSizes: { originalTextSize: 48, translationTextSize: 12 } }));
      assert.match(html, /data-size="24"/);
      assert.match(html, /data-selectable="false"/);
      assert.doesNotMatch(html, /aria-label="Open the window\.|aria-label="창문을 여세요\./);
      if (stage >= 15) assert.doesNotMatch(html, /Open|data-size="96"/);
      else {
        assert.match(html, /data-size="96"/);
        assert.equal(html.indexOf('data-size="96"') < html.indexOf('data-size="24"'), stage <= 12);
      }
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('legacy sizes stay unchanged without preferences and masked text stays inaccessible at custom sizes', () => {
  assert.match(renderToStaticMarkup(React.createElement(SpeechContent, { phrases, active: 0, view: 'bubble' })), /data-size="58"/);
  const html = renderToStaticMarkup(React.createElement(SpeechContent, { active: 0, view: 'list',
    phrases: [{ ...phrases[0], masked: true }], textSizes: { originalTextSize: 20, translationTextSize: 18 } }));
  assert.match(html, /data-size="40"/);
  assert.match(html, /aria-label="Open"/);
  assert.doesNotMatch(html, /aria-label="Open the window/);
  assert.match(html, /data-selectable="false"/);
});
