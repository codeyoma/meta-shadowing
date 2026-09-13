import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the real bridge entrypoint. Only Expo's binary module lookup is
// replaced: Node cannot load a React Native host, and Expo Go lacks our module.
function loadBridge(native: unknown = null) {
  const require = createRequire(import.meta.url);
  const filename = require.resolve('../../modules/package-delivery/index.ts');
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const lookup = (name: string) => {
    assert.equal(name, 'PackageDelivery');
    return native;
  };
  const expo = {
    requireOptionalNativeModule: lookup,
    requireNativeModule: (name: string) => {
      const module = lookup(name);
      if (!module) throw Error('Native module is absent from this binary');
      return module;
    },
  };
  const module = { exports: {} as { default: typeof import('../../modules/package-delivery').default } };
  new Function('require', 'module', 'exports', outputText)((name: string) => {
    assert.equal(name, 'expo');
    return expo;
  }, module, module.exports);
  return module.exports.default;
}

test('missing delivery binary permits import and reports unavailable rather than ready', async () => {
  const delivery = loadBridge();
  assert.equal(delivery.diagnosticsEnabled, false);
  assert.deepEqual(await delivery.status('controlled-descriptor'), { phase: 'unavailable', progress: 0 });
  assert.deepEqual(await delivery.diagnosticStatus(), {
    phase: 'unavailable', progress: 0, outcome: 'not-run', observedProgress: 0,
  });
});

test('missing delivery binary cannot fabricate downloads, storage checks or deletion success', async () => {
  const delivery = loadBridge();
  const actions = [
    () => delivery.start('controlled-descriptor'), () => delivery.cancel(),
    () => delivery.storage('controlled-descriptor'), () => delivery.removeMaterials('controlled-descriptor'),
    () => delivery.bundledBytes(), () => delivery.removeBundledMaterials(),
    () => delivery.diagnosticStart(false), () => delivery.diagnosticCancel(),
    () => delivery.diagnosticDamage('missing'), () => delivery.diagnosticReset(),
  ];
  for (const action of actions) await assert.rejects(action, /package-delivery-unavailable/);
});

test('available native delivery object is preserved without replacing its methods or receiver', () => {
  const native = { diagnosticsEnabled: true, marker: Symbol('native instance') };
  assert.equal(loadBridge(native), native);
});
