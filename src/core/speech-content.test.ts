import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { groupedSpeechBubbles } from './grouped-speech';
import type { SpeechContent } from '../components/speech-content';

// Execute the real component with React's server renderer. Only native leaf
// adapters are substituted; source selection and ordering are production JSX.
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const nativeContainer = ({ children }: React.PropsWithChildren) => React.createElement('div', null, children);
const leaf = ({ children }: React.PropsWithChildren) => React.createElement('span', null, children);
const compiled = ts.transpileModule(readFileSync(new URL('../components/speech-content.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const component = { exports: {} as { SpeechContent: typeof SpeechContent } };
runInNewContext(compiled, { exports: component.exports, module: component, require: (id: string) => {
  if (id === 'react-native') return { View: nativeContainer, ScrollView: nativeContainer, useWindowDimensions: () => ({ height: 900 }) };
  if (id === './ui') return { Label: leaf, usePalette: () => ({}) };
  if (id === './subtitle-text') return { SubtitleText: ({ text }: { text: string }) => React.createElement('span', null, text) };
  if (id === '@/core/grouped-speech') return { groupedSpeechBubbles };
  return require(id);
} });

const phrases = [
  { text: 'Previous source.', translation: '이전 번역' },
  { text: 'Current group.', translation: '현재 번역', members: [
    { text: 'Open the door.', translation: '문을 여세요.' },
    { text: 'Close the window.', translation: '창문을 닫으세요.' },
  ] },
  { text: 'Next source.', translation: '다음 번역' },
];
const render = (active: number, view: 'bubble' | 'list' = 'list', source = phrases) => renderToStaticMarkup(
  React.createElement(component.exports.SpeechContent, { phrases: source, active, view }));

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
