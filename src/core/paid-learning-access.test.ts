import test from 'node:test';
import assert from 'node:assert/strict';
import { PaidLearningAccess, type AccessSource } from './paid-learning-access';
import { DatabaseSync } from 'node:sqlite';
import { Journal } from './journal';
import { LearningContext } from './learning-context';
import { createSession } from './session';
import { Player } from './player';
test('reentry and foreground rechecks hide paid content until current authorization completes', async () => {
  let finish!: (value: {revision:number;allowed:boolean}) => void;
  let visible = false;
  const guard = new PaidLearningAccess({refresh: () => new Promise(r => {finish=r;}), subscribe: () => () => {}},
    () => {}, allowed => {visible=allowed;});
  for (const revision of [1,2,3]) {
    const check = guard.enter();
    assert.equal(visible,false,'content must be hidden synchronously while checking');
    finish({revision,allowed:true});
    assert.equal(await check,true);
    assert.equal(visible,true,'verified content becomes visible');
  }
  const last=guard.enter(); guard.dispose(); finish({revision:4,allowed:true});
  assert.equal(await last,false);assert.equal(visible,false);
});
test('late entry success cannot override a newer denial or disposed screen', async () => {
  let finish!: (value: {revision:number;allowed:boolean}) => void;
  let emit!: (value: {revision:number;allowed:boolean}) => void;
  const source: AccessSource = {refresh: () => new Promise(r => {finish=r;}), subscribe: fn => {emit=fn;return () => {};}};
  let stopped = 0;
  const guard = new PaidLearningAccess(source, () => {stopped++;});
  const pending = guard.enter();
  emit({revision:2,allowed:false}); finish({revision:1,allowed:true});
  assert.equal(await pending,false);
  const next = guard.enter(); finish({revision:3,allowed:true}); assert.equal(await next,true);
  emit({revision:4,allowed:false}); assert.equal(guard.allowed(),false); assert.ok(stopped > 0);
  const last = guard.enter(); guard.dispose(); finish({revision:5,allowed:true});
  assert.equal(await last,false);
});
test('revocation pauses a real durable run without awarding XP and reauthorization resumes it',async () => {
  const db=new DatabaseSync(':memory:');
  try {
    const journal=new Journal({exec:sql=>db.exec(sql),run:(sql,...args)=>{db.prepare(sql).run(...args);},
      first:<T>(sql:string,...args:(string|number)[])=>db.prepare(sql).get(...args) as T|undefined});
    const pack={language:'english',manifest:{id:'duo-33',version:1,title:'Fixture',phrases:[{file:'audio/phrase-001.m4a',bytes:1,sha256:'a'.repeat(64),text:'Fixture.',translation:'예문'}]}};
    const context=new LearningContext(pack,journal);
    const initial=createSession({runId:'paid-unfinished',stage:1,phraseCount:1,mode:'manual',rate:1});
    let position=0;
    const audio={prepare:async(_phrase:number,start:number)=>{position=start;},play(){},pause(){},position:()=>position,dispose(){}};
    const player=new Player(initial,audio,context.createWriter(initial),()=>0,()=>{});
    let current={revision:1,allowed:true}; let emit!:(value:typeof current)=>void;
    const guard=new PaidLearningAccess({refresh:async()=>current,subscribe:fn=>{emit=fn;return()=>{};}},()=>player.pause());
    assert.equal(await guard.enter(),true);await player.resume();position=1.25;
    current={revision:2,allowed:false};emit(current);
    assert.equal(guard.allowed(),false);assert.equal(context.load(1)?.audioSeconds,1.25);
    assert.equal(context.load(1)?.confirmed,0);assert.equal(journal.progress.summary('english').xp,0);
    current={revision:3,allowed:true};emit(current);assert.equal(guard.allowed(),false);
    assert.equal(await guard.enter(),true);await player.resume();
    assert.equal(position,1.25);assert.equal(context.load(1)?.runId,'paid-unfinished');
    assert.equal(journal.progress.summary('english').xp,0);
    guard.dispose();player.dispose();
  } finally {db.close();}
});
