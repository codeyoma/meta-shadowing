import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

/** Execute production components; substitute only the native/runtime boundaries. */
export function nativeModules(adapters: Record<string, unknown>) {
  const modules = new Map<string, { exports: any }>();
  function load(file: string): any {
    const path = resolve(root, file);
    if (modules.has(path)) return modules.get(path)!.exports;
    const module = { exports: {} };
    modules.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    runInNewContext(code, { module, exports: module.exports, console, setTimeout, clearTimeout, setInterval, clearInterval, performance, queueMicrotask,
      require: (name: string) => {
        if (name in adapters) return adapters[name];
        const target = name.startsWith('@/') ? resolve(root, name.slice(2)) : name.startsWith('.') ? resolve(dirname(path), name) : null;
        if (!target) return require(name);
        const canonical = `@/${relative(root, target)}`;
        if (canonical in adapters) return adapters[canonical];
        const extension = existsSync(`${target}.tsx`) ? '.tsx' : '.ts';
        return target.startsWith(resolve(root, 'core')) ? require(target + extension) : load(target + extension);
      } });
    return module.exports;
  }
  return load;
}

const motion: any = { duration: () => motion, easing: () => motion, reduceMotion: () => motion, withInitialValues: () => motion };
export const nativeMotion = { __esModule: true, default: { View: 'div', Text: nativeText },
  Easing: { bezier: () => null }, cubicBezier: () => null, LinearTransition: motion, FadeIn: motion, FadeOut: motion, FadeInLeft: motion,
  useSharedValue: (value: unknown) => ({ get: () => value, set: (next: unknown) => { value = next; } }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (value: unknown) => value, withDelay: (_: unknown, value: unknown) => value,
  ReduceMotion: { System: 'system' }, useReducedMotion: () => true };
export function nativeText({ children, style = {}, accessibilityLabel, selectable, allowFontScaling }: any) {
  return React.createElement('span', { 'data-size': style.fontSize, 'data-line-height': style.lineHeight,
    'data-ink': style.color, 'aria-label': accessibilityLabel, 'data-selectable': selectable,
    'data-scaling': allowFontScaling }, children);
}
export function nativeView({ children }: any) { return React.createElement('div', null, children); }
