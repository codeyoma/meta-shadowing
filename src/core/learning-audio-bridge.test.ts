import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(native: unknown, developmentJS: boolean) {
  const module = { exports: {} as typeof import('../../modules/learning-audio') };
  const code = ts.transpileModule(readFileSync(new URL('../../modules/learning-audio/index.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, { module, exports: module.exports, __DEV__: developmentJS, require: (name: string) => {
    assert.equal(name, 'expo');
    return { requireOptionalNativeModule: () => native };
  } });
  return module.exports;
}

test('native development monitoring remains available with standalone production JavaScript', () => {
  const native = { monitoringSupported: true, configureLearningPlayback() {} };
  for (const developmentJS of [true, false]) {
    assert.equal(load(native, developmentJS).learningMonitorSupported, true);
  }
});

test('monitoring stays unavailable without explicit native capability, regardless of JavaScript mode', () => {
  for (const developmentJS of [true, false]) {
    for (const native of [null, {}, { monitoringSupported: true },
      { monitoringSupported: false, configureLearningPlayback() {} },
      { monitoringSupported: 'true', configureLearningPlayback() {} }]) {
      assert.equal(load(native, developmentJS).learningMonitorSupported, false);
    }
  }
});
