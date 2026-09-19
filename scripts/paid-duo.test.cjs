const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {makeZip} = require('../tests/fixtures/zip-fixture.cjs');
const api = () => { let value={}; try {value=require('./paid-duo.cjs');} catch {} return value; };
test('disabled build strips paid content and enabled builds reject incomplete configuration',()=>{
  assert.equal(typeof api().configurePaidDuo,'function');
  const p={PaidDuoManifest:'private',PaidDuoDescriptor:'private',PaidDuoAssetPackID:'old'};
  api().configurePaidDuo(p,{},'.'); assert.deepEqual(p,{});
  assert.throws(()=>api().configurePaidDuo({}, {APPLE_PAID_DUO_ENABLED:'1'}, '.'));
});

function source(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'paid-duo-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const blocks=[]; let n=0;
  for(let section=1;section<=45;section++) { blocks.push(`## Section ${section}`); const count=section===45?32:12;
    for(let i=0;i<count;i++) blocks.push(`Fixture ${++n}.\n테스트 문장.`); }
  fs.writeFileSync(path.join(root,'text.txt'),blocks.join('\n\n'));
  fs.writeFileSync(path.join(root,'info.json'),JSON.stringify({phrase:560,section:45,language:'en'}));
  fs.writeFileSync(path.join(root,'cover.jpg'),Buffer.from([255,216,255,217]));
  fs.writeFileSync(path.join(root,'text-syntax.json'),JSON.stringify({entryCount:560,complete:true,entries:Array.from({length:560},(_,i)=>({phraseNumber:i+1,text:`Fixture ${i+1}.`}))}));
  fs.writeFileSync(path.join(root,'audio.zip'),makeZip(Array.from({length:560},(_,i)=>({name:String(i+1).padStart(3,'0')+'.mp3',data:Buffer.from('synthetic audio')}))));
  return root;
}
test('reads five regular source files, preserves metadata bytes, and rejects missing or linked inputs',t=>{
  const root=source(t); assert.equal(typeof api().readPaidSources,'function');
  const result=api().readPaidSources(root);
  assert.equal(result.phrases.length,560); assert.equal(result.audio.length,560);
  assert.deepEqual(result.metadata['syntax.json'],fs.readFileSync(path.join(root,'text-syntax.json')));
  fs.renameSync(path.join(root,'cover.jpg'),path.join(root,'other.jpg'));
  assert.throws(()=>api().readPaidSources(root));
  fs.symlinkSync(path.join(root,'other.jpg'),path.join(root,'cover.jpg'));
  assert.throws(()=>api().readPaidSources(root));
});
test('mismatched source counts or incomplete syntax cannot publish',t=>{
  const root=source(t); assert.equal(typeof api().readPaidSources,'function');
  fs.writeFileSync(path.join(root,'info.json'),JSON.stringify({phrase:559,section:45,language:'en'}));
  assert.throws(()=>api().readPaidSources(root));
});

test('preparation atomically writes metadata, refuses overwrite and rejects altered prepared bytes',async t=>{
  const input=source(t), output=path.join(input,'prepared');
  assert.equal(typeof api().preparePaidDuo,'function');
  const tools={convert:async bytes=>Buffer.concat([Buffer.from('converted:'),bytes]),archive:async staging=>{
    fs.writeFileSync(path.join(staging,'AssetPack.json'),JSON.stringify({assetPackID:'paid-fixture-v1'}));
  }};
  await api().preparePaidDuo(input,output,tools);
  assert.deepEqual(fs.readFileSync(path.join(output,'cover.jpg')),fs.readFileSync(path.join(input,'cover.jpg')));
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
  assert.equal(manifest.id,'duo-33'); assert.equal(manifest.phrases.length,560); assert.equal(manifest.sources.length,5);
  assert.equal(fs.existsSync(path.join(output,'audio.zip')),false);
  await assert.rejects(api().preparePaidDuo(input,output,tools));
  const env={APPLE_PAID_DUO_ENABLED:'1',APPLE_PAID_DUO_ASSET_PACK_ID:'paid-fixture-v1',APPLE_ASSET_APP_GROUP:'group.example.test',APPLE_BOOK_PRODUCT_ID:'com.example.book'};
  const root=path.join(input,'build'); fs.mkdirSync(path.join(root,'private'),{recursive:true});
  fs.renameSync(output,path.join(root,'private/paid-duo'));
  const p={}; api().configurePaidDuo(p,env,root);
  assert.equal(JSON.parse(p.PaidDuoDescriptor).files.length,565);
  assert.throws(()=>api().configurePaidDuo({}, {...env,APPLE_PAID_DUO_ASSET_PACK_ID:'different-v1'},root));
  fs.writeFileSync(path.join(root,'private/paid-duo/cover.jpg'),'changed');
  assert.throws(()=>api().configurePaidDuo({},env,root));
});
test('rejects syntax mapped to the wrong original block',t=>{
  const input=source(t), file=path.join(input,'text-syntax.json');
  const data=JSON.parse(fs.readFileSync(file)); data.entries[1].phraseNumber=1;
  fs.writeFileSync(file,JSON.stringify(data)); assert.throws(()=>api().readPaidSources(input));
  data.entries[1].phraseNumber=2; data.entries[1].text='Different source';
  fs.writeFileSync(file,JSON.stringify(data)); assert.throws(()=>api().readPaidSources(input));
});
test('conversion failure removes only its temporary output and keeps source intact',async t=>{
  const input=source(t), before=fs.readdirSync(input).sort();
  assert.equal(typeof api().preparePaidDuo,'function');
  await assert.rejects(api().preparePaidDuo(input,path.join(input,'prepared'),{convert:async()=>{throw Error('fault');},archive:async()=>{}}));
  assert.deepEqual(fs.readdirSync(input).sort(),before);
});
test('paid-only configuration can scaffold the shared delivery extension without a sample asset',()=>{
  const names=['APPLE_ASSET_APP_GROUP','APPLE_SAMPLE_ASSET_PACK_ID','APPLE_PAID_DUO_ENABLED','APPLE_DELIVERY_DIAGNOSTICS'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    process.env.APPLE_ASSET_APP_GROUP='group.example.fixture';
    process.env.APPLE_PAID_DUO_ENABLED='1';delete process.env.APPLE_SAMPLE_ASSET_PACK_ID;delete process.env.APPLE_DELIVERY_DIAGNOSTICS;
    assert.doesNotThrow(()=>require('../modules/package-delivery/app.plugin.js')({name:'Fixture',slug:'fixture',ios:{bundleIdentifier:'com.example.fixture'}}));
  } finally {for(const name of names) {if(previous[name]===undefined) delete process.env[name];else process.env[name]=previous[name];}}
});
