const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeZip } = require('../tests/fixtures/zip-fixture.cjs');
const read = (...args) => {
  let api = {}; try { api = require('./duo-archive.cjs'); } catch {}
  assert.equal(typeof api.readDuoAudioZip, 'function', 'bounded ZIP reader exists');
  return api.readDuoAudioZip(...args);
};
test('ordered stored and deflated audio preserves bytes and ignores only known metadata', () => {
  const zip = makeZip([
    {name:'002.mp3',data:Buffer.from('two'),method:8},
    {name:'__MACOSX/._001.mp3',data:Buffer.from('meta')},
    {name:'001.mp3',data:Buffer.from('one')},
  ]);
  assert.deepEqual(read(zip,2).map(x=>[x.name,x.bytes.toString()]), [['001.mp3','one'],['002.mp3','two']]);
});

test('rejects unsafe, duplicate, incomplete, symlink and unexpected archive entries', () => {
  for (const names of [['../001.mp3'], ['/001.mp3'], ['audio\\001.mp3'], ['001.mp3','001.mp3'], ['002.mp3'], ['001.mp3','secret.txt'], ['__MACOSX/secret','001.mp3']]) {
    assert.throws(() => read(makeZip(names.map(name=>({name,data:Buffer.from('audio')}))),1), /Invalid DUO archive/);
  }
  assert.throws(() => read(makeZip([{name:'001.mp3',data:Buffer.from('target'),mode:0o120777}]),1), /Invalid DUO archive/);
});

test('rejects inconsistent headers, corrupt CRC, encryption, unsupported methods and resource lies', () => {
  const original = makeZip([{name:'001.mp3',data:Buffer.from('audio')}]);
  const c = original.readUInt32LE(original.length-6);
  for (const alter of [
    b=>b.writeUInt16LE(1,c+8), b=>b.writeUInt16LE(99,c+10), b=>b.writeUInt32LE(50_000_001,c+24),
    b=>b.writeUInt32LE(0,c+16), b=>b.writeUInt32LE(2,c+42), b=>b.writeUInt16LE(1,b.length-18),
    b=>b.writeUInt32LE(0,c), b=>b.writeUInt16LE(0xffff,b.length-12), b=>b[30]=88,
    b=>b.writeUInt32LE(9999,c+20), b=>b.writeUInt32LE(9999,b.length-6),
  ]) {
    const changed = Buffer.from(original); alter(changed);
    assert.throws(()=>read(changed,1), /Invalid DUO archive/);
  }
  assert.throws(()=>read(original.subarray(0,-1),1), /Invalid DUO archive/);
  assert.throws(()=>read(makeZip([{name:'001.mp3',data:Buffer.alloc(100_000),method:8}]),1), /Invalid DUO archive/);
  assert.throws(()=>read(Buffer.alloc(0),1), /Invalid DUO archive/);
});
