import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {preparePaidDuo} from './paid-duo.cjs';

const root=fileURLToPath(new URL('../',import.meta.url));
function run(command,args,cwd) {
  const result=spawnSync(command,args,{cwd,maxBuffer:1_000_000});
  if(result.error || result.status!==0) throw Error('Package tool failed; nothing published.');
  return result.stdout;
}
try {
  if(process.argv.length!==3) throw Error('Supply the approved source directory.');
  const asset=process.env.APPLE_PAID_DUO_ASSET_PACK_ID;
  if(!asset || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(asset)) throw Error('Set the approved paid asset-pack identifier.');
  await preparePaidDuo(process.argv[2],path.join(root,'private/paid-duo'),{
    async convert(bytes,staging) {
      const input=path.join(staging,'conversion.mp3'),output=path.join(staging,'conversion.m4a');
      fs.writeFileSync(input,bytes);
      run('/usr/bin/afconvert',[input,output,'-f','m4af','-d','aac','-b','64000'],staging);
      const converted=fs.readFileSync(output); fs.unlinkSync(input); fs.unlinkSync(output); return converted;
    },
    async archive(staging,files) {
      fs.writeFileSync(path.join(staging,'AssetPack.json'),JSON.stringify({assetPackID:asset,downloadPolicy:{onDemand:{}},platforms:['iOS'],fileSelectors:files.map(file=>({file}))}));
      fs.writeFileSync(path.join(staging,'preparation.json'),JSON.stringify({node:process.version,converter:'afconvert -f m4af -d aac -b 64000',os:run('/usr/bin/sw_vers',['-productVersion'],staging).toString().trim()}));
      run('xcrun',['ba-package','AssetPack.json','-o','DuoPaid.aar'],staging);
    },
  });
  console.log('Prepared private paid package. Nothing uploaded.');
} catch { console.error('Paid DUO preparation failed. Verify source, immutable output and local tool configuration.'); process.exitCode=1; }
