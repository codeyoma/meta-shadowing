import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { nativeModules, nativeMotion } from '../test-support/native-render';
import { createSession } from './session';
import * as reveal from './word-reveal';
import { normalizeSpeakingSpeeds } from './speaking-speed';
import type { WordRevealContent } from '../components/word-reveal-content';
import type { RevealSpeedControl } from '../components/reveal-speed-control';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const container = ({ children }: React.PropsWithChildren) => React.createElement('div', null, children);
const text = ({ children, accessibilityLabel, style, selectable }: React.PropsWithChildren<{
  accessibilityLabel?: string; style: { color?: string; fontSize?: number }; selectable?: boolean;
}>) => React.createElement('span', { 'aria-label': accessibilityLabel, 'data-ink': style.color,
  'data-size': style.fontSize, 'data-selectable': selectable }, children);

function load<T>(file: string, adapters: Record<string, unknown>): T {
  return nativeModules(adapters)(`components/${file}.tsx`) as T;
}

const { WordRevealContent: Content } = load<{ WordRevealContent: typeof WordRevealContent }>('word-reveal-content', {
  'react-native': { View: container, Text: text, useWindowDimensions: () => ({ fontScale: 2 }) },
  'react-native-reanimated': nativeMotion,
  'expo-font': { isLoaded: () => true },
  './ui': { usePalette: () => ({ card: '#ffffff', blueSoft: '#aabbcc', heading: '#000000' }) },
  '@/core/word-reveal': reveal,
});

test('rendered timed text preserves hidden layout, scales text and exposes only the visible prefix', () => {
  const state = { ...createSession({ runId: 'ui', stage: 11, phraseCount: 1, mode: 'manual', rate: 1 }),
    phase: 'listening' as const, audioSeconds: 0.4 };
  for (const view of ['bubble', 'list'] as const) {
    const html = renderToStaticMarkup(React.createElement(Content, { state, view, phrase: { text: 'We go.', translation: '가요.' } }));
    assert.match(html, /aria-label="We"/);
    assert.doesNotMatch(html, /aria-label="We go\.|aria-label="가요\./);
    assert.match(html, /data-size="54"/);
    assert.match(html, /data-selectable="false"/);
    assert.match(html, new RegExp(`data-ink="${view === 'bubble' ? '#ffffff' : '#aabbcc'}">go\\.`));
  }
});

test('Korean-only render never mounts target words, even after completion', () => {
  const state = { ...createSession({ runId: 'ko', stage: 16, phraseCount: 1, mode: 'manual', rate: 1 }), phase: 'speaking' as const };
  const html = renderToStaticMarkup(React.createElement(Content, { state, view: 'list', phrase: { text: 'Hidden answer', translation: '한국어 문장' } }));
  assert.doesNotMatch(html, /Hidden|answer/);
  assert.match(html, /aria-label="한국어 문장"/);
});

test('S selector invokes the chosen speed without automatic progression and marks the current choice', () => {
  const pickers: { selection: number; onSelectionChange(value: number): void }[] = [];
  const { SystemPicker } = load<{ SystemPicker: React.ComponentType }>('system-picker', {
    '@expo/ui/swift-ui': { Host: container, Text: container,
      Picker: (props: React.PropsWithChildren<typeof pickers[number]>) => { pickers.push(props); return container(props); } },
    '@expo/ui/swift-ui/modifiers': { pickerStyle: () => ({}), tag: () => ({}) },
  });
  const { RevealSpeedControl: Control } = load<{ RevealSpeedControl: typeof RevealSpeedControl }>('reveal-speed-control', {
    'react-native': { View: container }, './settings-section': { SettingsSection: container },
    './ui': { Choice: () => null, Label: container }, './system-picker': { SystemPicker },
    '@/core/speaking-speed': { normalizeSpeakingSpeeds },
  });
  const selected: number[] = [];
  const onChange = (speed: number) => { selected.push(speed); };
  const html = renderToStaticMarkup(React.createElement(Control, { reveal: { speed: 2, wpm: 200 }, onChange }));
  assert.equal(pickers.length, 1);
  assert.match(html, /S1.*S2.*S3.*S4/);
  assert.match(html, /200 WPM/);
  assert.equal(pickers[0]!.selection, 2);
  assert.deepEqual(selected, []);
  pickers[0]!.onSelectionChange(4);
  assert.deepEqual(selected, [4]);

  // A changed global preset must not mislabel the saved run or prevent reapplying S2.
  pickers.length = 0;
  const saved = renderToStaticMarkup(React.createElement(Control, { reveal: { speed: 2, wpm: 180 }, onChange }));
  assert.match(saved, /180 WPM/);
  assert.equal(pickers[0]!.selection, 0);
  pickers[0]!.onSelectionChange(2);
  assert.deepEqual(selected, [4, 2]);
});
