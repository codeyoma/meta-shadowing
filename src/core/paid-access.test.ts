import test from 'node:test';
import assert from 'node:assert/strict';
import { PaidAccessStore } from './paid-access';
test('native denial wins over stale success; bridge failure needs a fresh native response', async () => {
  let resolve!: (v: unknown) => void;
  let emit!: (v: unknown) => void;
  const access = new PaidAccessStore({ read: () => new Promise(r => {resolve=r;}), listen: fn => {emit=fn; return () => {};} });
  const pending = access.refresh();
  emit({revision:2,allowed:false}); resolve({revision:1,allowed:true});
  assert.equal((await pending).allowed,false);
  emit({revision:3,allowed:true}); assert.equal(access.getSnapshot().allowed,true);
  emit({allowed:true}); assert.equal(access.getSnapshot().allowed,false);
  emit({revision:3,allowed:true}); assert.equal(access.getSnapshot().allowed,false);
  const fresh = access.refresh(); resolve({revision:3,allowed:true});
  assert.equal((await fresh).allowed,true);
});
test('old binary or missing native bridge cannot authorize', async () => {
  const access = new PaidAccessStore({ read: async () => {throw Error('unavailable');},listen: () => () => {} });
  assert.equal((await access.refresh()).allowed,false);
});
test('a read method without a working revocation subscription cannot grant access',async () => {
  const access=new PaidAccessStore({read:async()=>({revision:1,allowed:true}),listen:()=>{throw Error('old binary');}});
  assert.equal((await access.refresh()).allowed,false);
});
