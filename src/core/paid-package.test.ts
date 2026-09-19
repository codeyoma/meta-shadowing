import test from 'node:test';
import assert from 'node:assert/strict';
import { paidAction, readPaidPackage } from './paid-package';

test('paid action never equates installed files with ownership', () => {
  for (const installed of [false, true]) {
    assert.equal(paidAction({configured:true,ownership:'owned',authorized:false,installed}), 'verify');
    assert.equal(paidAction({configured:true,ownership:'notOwned',authorized:false,installed}), 'purchase');
    assert.equal(paidAction({configured:false,ownership:'owned',authorized:true,installed}), 'unavailable');
    assert.equal(paidAction({configured:true,ownership:'owned',authorized:true,installed}), installed ? 'study' : 'download');
  }
});
export const paidManifest = () => ({ id: 'duo-33', version: 1, title: 'Controlled fixture',
  metadata: ['cover.jpg','info.json','text.txt','syntax.json'].map(file => ({file,bytes:1,sha256:'a'.repeat(64)})),
  phrases: Array.from({length:560}, (_,i) => ({file:`audio/phrase-${String(i+1).padStart(3,'0')}.m4a`,bytes:1,sha256:'a'.repeat(64),text:`Example ${i+1}.`,translation:'예문',section:Math.min(45,Math.floor(i/13)+1)})) });
test('only exact paid identity and complete ordered pinned files enter the catalog', () => {
  assert.ok(readPaidPackage(JSON.stringify(paidManifest())));
  assert.equal(readPaidPackage(null),null);
  for (const change of [
    (m: any) => m.id = 'duo-33-free-test', (m: any) => m.version = 2,
    (m: any) => m.phrases.pop(), (m: any) => m.metadata.pop(),
    (m: any) => m.phrases[1].file = m.phrases[0].file,
    (m: any) => m.phrases[0].translation = '', (m: any) => m.phrases[0].file = '../outside',
  ]) { const m = paidManifest(); change(m); assert.equal(readPaidPackage(JSON.stringify(m)),null); }
});
