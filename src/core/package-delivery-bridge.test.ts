import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the real bridge entrypoint. Only Expo's binary module lookup is
// replaced: Node cannot load a React Native host, and Expo Go lacks our module.
function loadBridgeModule(native: unknown = null) {
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
  const module = { exports: {} as typeof import('../../modules/package-delivery') };
  new Function('require', 'module', 'exports', outputText)((name: string) => {
    assert.equal(name, 'expo');
    return expo;
  }, module, module.exports);
  return module.exports;
}

function loadBridge(native: unknown = null) { return loadBridgeModule(native).default; }

test('animation preview fails closed without explicit native development permission', () => {
  for (const native of [null, {}, { animationPreviewEnabled: false }, { animationPreviewEnabled: 'true' }]) {
    assert.equal(loadBridgeModule(native).animationPreviewEnabled, false);
  }
  assert.equal(loadBridgeModule({ animationPreviewEnabled: true }).animationPreviewEnabled, true);
});

test('missing delivery binary permits import and reports unavailable rather than ready', async () => {
  const delivery = loadBridge();
  assert.equal(delivery.diagnosticsEnabled, false);
  assert.equal(delivery.freeDuoManifest, null);
  assert.deepEqual(await delivery.status('controlled-descriptor'), { phase: 'unavailable', progress: 0 });
  assert.deepEqual(await delivery.diagnosticStatus(), {
    phase: 'unavailable', progress: 0, outcome: 'not-run', observedProgress: 0,
  });
});

test('missing delivery binary cannot fabricate downloads, storage checks or deletion success', async () => {
  const delivery = loadBridge();
  const actions = [
    () => delivery.freeDuoStatus(), () => delivery.freeDuoStart(), () => delivery.freeDuoCancel(),
    () => delivery.freeDuoStorage(), () => delivery.freeDuoRemove(),
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
