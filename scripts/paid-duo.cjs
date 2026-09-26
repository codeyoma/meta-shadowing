const fs = require('node:fs');
const path = require('node:path');
const {parseDuo, hash} = require('./free-duo.cjs');
const {readDuoAudioZip} = require('./duo-archive.cjs');
const key = 'duo-33-v1';
const metadataNames = ['cover.jpg','info.json','text.txt','syntax.json'];
function regular(file, limit) {
  const stat=fs.lstatSync(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw Error('Invalid paid source.');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try { const data=fs.readFileSync(fd); if(data.length!==stat.size || data.length>limit) throw Error('Source changed.'); return data; }
  finally {fs.closeSync(fd);}
}
function readPaidSources(source) {
  if (!fs.lstatSync(source).isDirectory()) throw Error('Invalid source directory.');
  const metadata={}, originals=[];
  for(const name of ['cover.jpg','info.json','text.txt','text-syntax.json','audio.zip']) {
    const bytes=regular(path.join(source,name),name==='audio.zip'?1_000_000_000:20_000_000);
    originals.push({file:name,bytes:bytes.length,sha256:hash(bytes)});
    metadata[name==='text-syntax.json'?'syntax.json':name]=bytes;
  }
  const info=JSON.parse(metadata['info.json']);
  if(Number(info.phrase)!==560 || Number(info.section)!==45 || info.language!=='en') throw Error('DUO counts disagree.');
  const phrases=parseDuo(metadata['text.txt'].toString('utf8'),560,45);
  const syntax=JSON.parse(metadata['syntax.json']);
  if(syntax.entryCount!==560 || syntax.complete!==true || !Array.isArray(syntax.entries) || syntax.entries.length!==560) throw Error('Incomplete syntax.');
  const normalized=text=>typeof text==='string'?text.replace(/\s+/g,' ').trim():null;
  if(syntax.entries.some((entry,i)=>entry.phraseNumber!==i+1 || normalized(entry.text)!==normalized(phrases[i].text))) throw Error('Syntax does not match source.');
  if(metadata['cover.jpg'].subarray(0,3).toString('hex')!=='ffd8ff') throw Error('Expected JPEG cover.');
  const audio=readDuoAudioZip(metadata['audio.zip'],560); delete metadata['audio.zip'];
  return {metadata,originals,phrases,audio};
}
function configurePaidDuo(plist, env, root) {
  for (const key of ['PaidDuoManifest','PaidDuoDescriptor','PaidDuoAssetPackID']) delete plist[key];
  if (env.APPLE_PAID_DUO_ENABLED !== '1') return;
  const asset=env.APPLE_PAID_DUO_ASSET_PACK_ID?.trim(), product=env.APPLE_BOOK_PRODUCT_ID?.trim();
  if (!asset || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(asset) || !product || !env.APPLE_ASSET_APP_GROUP
    || [env.APPLE_SAMPLE_ASSET_PACK_ID,'duo-33-free-test-v1','duo-33-free-test-v2','delivery-diagnostic-v1'].includes(asset)) throw Error('Invalid paid delivery configuration.');
  const base=path.join(root,'private/paid-duo'), raw=regular(path.join(base,'manifest.json'),20_000_000);
  if(JSON.parse(regular(path.join(base,'AssetPack.json'),1_000_000)).assetPackID!==asset) throw Error('Immutable asset mapping changed.');
  const manifest=JSON.parse(raw);
  if(manifest.id!=='duo-33' || manifest.version!==1 || manifest.phrases?.length!==560
    || manifest.metadata?.length!==4 || manifest.sources?.length!==5) throw Error('Invalid paid manifest.');
  const pinned=[...manifest.metadata,...manifest.phrases];
  const expected=new Set([...metadataNames,...Array.from({length:560},(_,i)=>`audio/phrase-${String(i+1).padStart(3,'0')}.m4a`)]);
  for(const entry of pinned) {
    if(!expected.delete(entry.file) || !Number.isSafeInteger(entry.bytes) || entry.bytes<1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid paid descriptor.');
    const bytes=regular(path.join(base,entry.file),entry.file.startsWith('audio/')?50_000_000:20_000_000);
    if(bytes.length!==entry.bytes || hash(bytes)!==entry.sha256) throw Error('Prepared content changed.');
  }
  if(expected.size) throw Error('Incomplete paid descriptor.');
  if(pinned.reduce((sum,entry)=>sum+entry.bytes,raw.length)>1_000_000_000) throw Error('Prepared package exceeds size limit.');
  Object.assign(plist,{PaidDuoAssetPackID:asset,PaidDuoManifest:raw.toString('utf8'),PaidDuoDescriptor:JSON.stringify({key,files:[
    {file:'manifest.json',bytes:raw.length,sha256:hash(raw)},...pinned.map(({file,bytes,sha256})=>({file,bytes,sha256}))]})});
}
async function preparePaidDuo(source, output, tools) {
  if(fs.existsSync(output)) throw Error('Immutable package already exists.');
  const input=readPaidSources(source);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const staging=fs.mkdtempSync(path.join(path.dirname(output),'paid-prepare-'));
  try {
    fs.mkdirSync(path.join(staging,'audio'));
    const metadata=[];
    for(const [file,data] of Object.entries(input.metadata)) {
      fs.writeFileSync(path.join(staging,file),data); metadata.push({file,bytes:data.length,sha256:hash(data)});
    }
    const phrases=[];
    let total=metadata.reduce((sum,entry)=>sum+entry.bytes,0);
    for(const [i,item] of input.audio.entries()) {
      const file=`audio/phrase-${String(i+1).padStart(3,'0')}.m4a`;
      const bytes=await tools.convert(item.bytes,staging);
      if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>50_000_000) throw Error('Invalid converted audio.');
      total+=bytes.length;
      if(total>1_000_000_000) throw Error('Converted package exceeds size limit.');
      fs.writeFileSync(path.join(staging,file),bytes);
      phrases.push({...input.phrases[i],file,bytes:bytes.length,sha256:hash(bytes)});
    }
    const manifest={id:'duo-33',version:1,title:'DUO 3.3',sources:input.originals,metadata,phrases};
    const serialized=Buffer.from(JSON.stringify(manifest));
    if(serialized.length>20_000_000 || total+serialized.length>1_000_000_000) throw Error('Manifest exceeds size limit.');
    fs.writeFileSync(path.join(staging,'manifest.json'),serialized);
    for(const entry of [...metadata,...phrases]) if(hash(regular(path.join(staging,entry.file),50_000_000))!==entry.sha256) throw Error('Written content changed.');
    await tools.archive(staging,['manifest.json',...metadata.map(x=>x.file),...phrases.map(x=>x.file)]);
    if(fs.existsSync(output)) throw Error('Immutable package already exists.');
    fs.renameSync(staging,output);
  } finally {fs.rmSync(staging,{recursive:true,force:true});}
}
module.exports = {configurePaidDuo,readPaidSources,preparePaidDuo,regular,key,metadataNames};
