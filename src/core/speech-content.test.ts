import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { nativeModules } from '../test-support/native-render';
import { groupedSpeechBubbles } from './grouped-speech';
import type { SpeechContent } from '../components/speech-content';

// Execute the real component with React's server renderer. Only native leaf
// adapters are substituted; source selection and ordering are production JSX.
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const nativeContainer = ({ children }: React.PropsWithChildren) => React.createElement('div', null, children);
const leaf = ({ children }: React.PropsWithChildren) => React.createElement('span', null, children);
const component = nativeModules({
  'react-native': { View: nativeContainer, ScrollView: nativeContainer, useWindowDimensions: () => ({ height: 900 }) },
  './ui': { Label: leaf, usePalette: () => ({}) },
  './subtitle-text': { SubtitleText: ({ text }: { text: string }) => React.createElement('span', null, text) },
  '@/core/grouped-speech': { groupedSpeechBubbles },
})('components/speech-content.tsx') as { SpeechContent: typeof SpeechContent };

const phrases = [
  { text: 'Previous source.', translation: '이전 번역' },
  { text: 'Current group.', translation: '현재 번역', members: [
    { text: 'Open the door.', translation: '문을 여세요.' },
    { text: 'Close the window.', translation: '창문을 닫으세요.' },
  ] },
  { text: 'Next source.', translation: '다음 번역' },
];
const render = (active: number, view: 'bubble' | 'list' = 'list', source = phrases) => renderToStaticMarkup(
  React.createElement(component.SpeechContent, { phrases: source, active, view }));

test('list view renders only the active group, with each translation immediately after its source', () => {
  const html = render(1);
  assert.doesNotMatch(html, /Previous source|Next source|이전 번역|다음 번역/);
  const values = ['Open the door.', '문을 여세요.', 'Close the window.', '창문을 닫으세요.'];
  let cursor = -1;
  for (const value of values) { const next = html.indexOf(value); assert.ok(next > cursor); cursor = next; }
});

test('changing active phrase replaces the group instead of retaining neighboring lesson rows', () => {
  const html = render(2);
  assert.match(html, /Next source/);
  assert.doesNotMatch(html, /Previous source|Open the door|Close the window/);
  assert.equal(render(-1), '');
  assert.equal(render(3), '');
});

test('list dialogue preserves whole utterances and their matching translations', () => {
  const html = render(0, 'list', [{ text: '"Hello! Come inside." "Thank you."', translation: '"안녕! 들어와." "고마워."' }]);
  assert.match(html, /Hello! Come inside\.<\/span><span>안녕! 들어와\./);
  assert.match(html, /Thank you\.<\/span><span>고마워\./);
});
