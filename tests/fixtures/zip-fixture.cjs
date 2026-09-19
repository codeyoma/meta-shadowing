const { crc32, deflateRawSync } = require('node:zlib');
function makeZip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const {name, data, mode = 0o100644, method = 0} of entries) {
    const n = Buffer.from(name), payload = method === 8 ? deflateRawSync(data) : data;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4);
    h.writeUInt16LE(method,8); h.writeUInt32LE(crc32(data),14);
    h.writeUInt32LE(payload.length,18); h.writeUInt32LE(data.length,22); h.writeUInt16LE(n.length,26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x314,4); c.writeUInt16LE(20,6);
    c.writeUInt16LE(method,10); c.writeUInt32LE(crc32(data),16);
    c.writeUInt32LE(payload.length,20); c.writeUInt32LE(data.length,24); c.writeUInt16LE(n.length,28);
    c.writeUInt32LE((mode << 16) >>> 0,38); c.writeUInt32LE(offset,42);
    locals.push(h,n,payload); central.push(c,n); offset += h.length+n.length+payload.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
module.exports = { makeZip };
