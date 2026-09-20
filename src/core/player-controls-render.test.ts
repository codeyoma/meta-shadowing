import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import type { PlayerControls } from '../components/player-controls';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const host = ({ children, style }: React.PropsWithChildren<{ style?: { opacity?: number } }>) =>
  React.createElement('div', { 'data-opacity': style?.opacity }, children);
// Only native hosts/animation builders are adapted; the real controls choose
// disabled semantics, opacity and icons for both main and repeat actions.
const motion = { duration: () => motion, easing: () => motion, reduceMotion: () => motion, withInitialValues: () => motion };
const adapters: Record<string, unknown> = {
  'react-native': { View: host },
  'react-native-reanimated': { __esModule: true, default: { View: host },
    Easing: { bezier: () => null }, FadeInLeft: motion, LinearTransition: motion,
    ReduceMotion: { System: 'system' }, useReducedMotion: () => true },
  './ui': { usePalette: () => ({}), Icon: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name }) },
  './feedback-pressable': { FeedbackPressable: ({ children, disabled, accessibilityLabel, accessibilityState }: {
    children: (state: { pressed: boolean }) => React.ReactNode; disabled: boolean;
    accessibilityLabel: string; accessibilityState: { disabled: boolean };
  }) => React.createElement('button', { disabled, 'aria-label': accessibilityLabel, 'aria-disabled': accessibilityState.disabled }, children({ pressed: false })) },
};
const code = ts.transpileModule(readFileSync(new URL('../components/player-controls.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const module = { exports: {} as { PlayerControls: typeof PlayerControls } };
runInNewContext(code, { module, exports: module.exports, require: (id: string) => adapters[id] ?? require(id) });

test('quiet revalidation locks both controls without changing their opacity or icons', () => {
  const render = (blocked: boolean, busy = false) => renderToStaticMarkup(React.createElement(module.exports.PlayerControls,
    { action: 'next', repeat: true, busy, blocked, onMain() {}, onRepeat() {} }));
  const ready = render(false), refreshing = render(true);
  assert.equal((refreshing.match(/disabled=""/g) ?? []).length, 2);
  assert.equal((refreshing.match(/aria-disabled="true"/g) ?? []).length, 2);
  const appearance = (html: string) => html.replace(/ disabled=""/g, '').replace(/ aria-disabled="(?:true|false)"/g, '');
  assert.equal(appearance(refreshing), appearance(ready));
  assert.equal((refreshing.match(/data-opacity="1"/g) ?? []).length, 2);
  assert.equal((render(false, true).match(/data-opacity="0.45"/g) ?? []).length, 2, 'Real action loading keeps disabled feedback');
});
