import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import * as menu from './sentence-menu';
import type { SentenceMenu } from '../components/sentence-menu';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');

test('sentence menu centers the current row, retries unmeasured rows and stops on manual scroll', () => {
  let props: Record<string, any>;
  const positions: { index: number; viewPosition: number; viewOffset: number; animated: boolean }[] = [], offsets: number[] = [];
  const timers = new Map<number, () => void>(); let nextTimer = 0;
  const effects: (() => unknown)[] = [];
  const adapters: Record<string, unknown> = {
    react: { ...React, useEffect: (effect: () => unknown) => { effects.push(effect); } },
    'expo-router/react-navigation': { useHeaderHeight: () => 64 },
    'react-native': { FlatList: (input: Record<string, any>) => {
      props = input;
      if (input.ref) input.ref.current = { scrollToIndex: (position: typeof positions[number]) => { positions.push(position); },
        scrollToOffset: ({ offset }: { offset: number }) => { offsets.push(offset); } };
      return null;
    } },
    './ui': { usePalette: () => ({}) }, './settings-row': { useSettingsColors: () => ({}) },
    '@/core/sentence-menu': menu,
  };
  const code = ts.transpileModule(readFileSync(new URL('../components/sentence-menu.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as { SentenceMenu: typeof SentenceMenu } };
  runInNewContext(code, { module, exports: module.exports, require: (id: string) => adapters[id] ?? require(id),
    setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id: number) => timers.delete(id) });
  const rows = Array.from({ length: 80 }, (_, i) => ({ sourceIndex: i, unitIndex: i, text: `Sentence ${i}`, translation: '번역' }));
  renderToStaticMarkup(React.createElement(module.exports.SentenceMenu, { sections: [{ title: null, rows }], currentUnit: 53, disabled: false, onSelect() {} }));
  const cleanup = effects.map(effect => effect()).filter((value): value is () => void => typeof value === 'function');
  assert.equal(typeof props!.onLayout, 'function');
  props!.onLayout({ nativeEvent: { layout: { height: 320 } } });
  props!.onContentSizeChange(300, 8000);
  for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  assert.equal(positions.at(-1)?.index, 53);
  assert.equal(positions.at(-1)?.viewPosition, 0.5);
  assert.equal(positions.at(-1)?.viewOffset, 32, 'Center below the transparent sheet header');
  assert.equal(positions.at(-1)?.animated, false);
  const initialCount = positions.length;
  props!.onContentSizeChange(300, 8150);
  for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  assert.equal(positions.length, initialCount + 1, 'Correct the position after padding/row measurements settle');
  props!.onScrollToIndexFailed({ index: 53, highestMeasuredFrameIndex: 9, averageItemLength: 100 });
  assert.ok(offsets.at(-1)! > 0);
  assert.ok(timers.size > 0);
  const before = positions.length;
  props!.onScrollBeginDrag();
  for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  props!.onContentSizeChange(300, 8100);
  assert.equal(positions.length, before, 'Do not pull the user back after they start browsing');
  cleanup.forEach(dispose => dispose());
  assert.equal(timers.size, 0);
});
