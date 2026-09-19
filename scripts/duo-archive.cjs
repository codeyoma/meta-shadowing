const { inflateRawSync, crc32 } = require('node:zlib');

// Bounded ZIP32 importer (PKWARE APPNOTE 6.3.10), never extracts archive paths.
function readDuoAudioZip(zip, count) {
  try { return read(zip, count); }
  catch { throw Error('Invalid DUO archive.'); }
}
function read(zip, count) {
  const ensure = condition => { if (!condition) throw Error(); };
  ensure(Buffer.isBuffer(zip) && zip.length >= 22 && Number.isInteger(count) && count > 0 && count <= 999);
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557)
    && (zip.readUInt32LE(end) !== 0x06054b50 || end + 22 + zip.readUInt16LE(end + 20) !== zip.length)) end--;
  ensure(end >= 0 && zip.readUInt32LE(end) === 0x06054b50);
  ensure(zip.readUInt16LE(end+4) === 0 && zip.readUInt16LE(end+6) === 0);
  const entries = zip.readUInt16LE(end+10), directory = zip.readUInt32LE(end+16);
  ensure(entries > 0 && entries <= 2000 && zip.readUInt16LE(end+8) === entries);
  ensure(directory + zip.readUInt32LE(end+12) === end);
  const expected = new Set(Array.from({length:count}, (_,i)=>String(i+1).padStart(3,'0')+'.mp3'));
  const seen = new Set(), records = []; let at = directory, total = 0;
  function extras(start, length) {
    const stop = start + length;
    while (start < stop) {
      ensure(start + 4 <= stop);
      const id = zip.readUInt16LE(start), size = zip.readUInt16LE(start+2);
      ensure(id !== 1 && start + 4 + size <= stop);
      start += 4 + size;
    }
  }
  for (let i=0; i<entries; i++) {
    ensure(at+46 <= end && zip.readUInt32LE(at) === 0x02014b50);
    const flags=zip.readUInt16LE(at+8), method=zip.readUInt16LE(at+10);
    const crc=zip.readUInt32LE(at+16), compressed=zip.readUInt32LE(at+20), size=zip.readUInt32LE(at+24);
    const n=zip.readUInt16LE(at+28), extra=zip.readUInt16LE(at+30), comment=zip.readUInt16LE(at+32);
    const offset=zip.readUInt32LE(at+42), attrs=zip.readUInt32LE(at+38), mode=(attrs>>>16)&0xf000;
    ensure(at+46+n+extra+comment <= end && n > 0);
    ensure((flags & ~0x080e) === 0 && [0,8].includes(method) && zip.readUInt16LE(at+34) === 0);
    ensure(mode === 0 || mode === 0x8000);
    ensure((attrs & 0x10) === 0);
    const nameBytes=zip.subarray(at+46,at+46+n), name=nameBytes.toString('ascii');
    ensure(Buffer.from(name,'ascii').equals(nameBytes));
    ensure(expected.has(name) || /^__MACOSX\/\._\d{3}\.mp3$/.test(name));
    ensure(!seen.has(name)); seen.add(name);
    ensure(size > 0 && size <= 50_000_000 && compressed > 0 && size / compressed <= 200);
    total += size; ensure(total <= 1_000_000_000);
    extras(at+46+n,extra);
    ensure(offset+30 <= directory && zip.readUInt32LE(offset) === 0x04034b50);
    ensure(zip.readUInt16LE(offset+6) === flags && zip.readUInt16LE(offset+8) === method);
    const ln=zip.readUInt16LE(offset+26), le=zip.readUInt16LE(offset+28);
    const start=offset+30+ln+le;
    ensure(ln===n && start+compressed <= directory);
    ensure(zip.subarray(offset+30,offset+30+ln).equals(nameBytes));
    extras(offset+30+ln,le);
    let stop = start+compressed;
    if (flags & 8) {
      for (const [pos,value] of [[14,crc],[18,compressed],[22,size]]) {
        const local=zip.readUInt32LE(offset+pos); ensure(local===0 || local===value);
      }
      if (zip.readUInt32LE(stop)===0x08074b50) stop+=4;
      ensure(stop+12 <= directory && zip.readUInt32LE(stop)===crc
        && zip.readUInt32LE(stop+4)===compressed && zip.readUInt32LE(stop+8)===size);
      stop+=12;
    } else {
      ensure(zip.readUInt32LE(offset+14)===crc && zip.readUInt32LE(offset+18)===compressed
        && zip.readUInt32LE(offset+22)===size);
    }
    records.push({name,offset,start,stop,compressed,size,crc,method});
    at += 46+n+extra+comment;
  }
  ensure(at===end && [...expected].every(name=>seen.has(name)));
  const ranges=[...records].sort((a,b)=>a.offset-b.offset);
  let next=0;
  for (const r of ranges) { ensure(r.offset===next); next=r.stop; }
  ensure(next===directory);
  const result=[];
  for (const r of records) {
    const payload=zip.subarray(r.start,r.start+r.compressed);
    const inflated=r.method===8 ? inflateRawSync(payload,{maxOutputLength:r.size,info:true}) : null;
    if (inflated) ensure(inflated.engine.bytesWritten===payload.length);
    const bytes=inflated ? inflated.buffer : payload;
    ensure(bytes.length===r.size && crc32(bytes)===r.crc);
    if (expected.has(r.name)) result.push({name:r.name,bytes});
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name));
}
module.exports = { readDuoAudioZip };
