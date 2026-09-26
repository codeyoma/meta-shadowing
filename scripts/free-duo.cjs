const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const key = 'duo-33-free-test-v1';
const syntaxKey = 'duo-33-free-test-v2';
const hash = data => createHash('sha256').update(data).digest('hex');

function parseDuo(source, phraseCount, sectionCount) {
  const phrases = [];
  let section = 0;
  for (const block of source.trim().split(/\r?\n\s*\r?\n/)) {
    const header = /^## Section (\d+)$/.exec(block.trim());
    if (header) {
      if (Number(header[1]) !== section + 1) throw Error('Non-sequential section.');
      section++;
      continue;
    }
    const lines = block.split(/\r?\n/).map(line => line.trim());
    const split = lines.findIndex(line => /[가-힣]/.test(line));
    if (!section || split < 1 || lines.slice(split).some(line => !/[가-힣]/.test(line))) {
      throw Error('Ambiguous phrase/translation boundary.');
    }
    phrases.push({ text: lines.slice(0, split).join('\n'), translation: lines.slice(split).join('\n'), section });
  }
  if (phrases.length !== phraseCount || section !== sectionCount) throw Error('Source counts do not match metadata.');
  return phrases;
}

function audioEntries(entries, count) {
  const audio = entries.filter(name => !/^__MACOSX\/\._\d{3}\.mp3$/.test(name));
  const expected = Array.from({ length: count }, (_, i) => `${String(i + 1).padStart(3, '0')}.mp3`);
  if (audio.length !== count || new Set(audio).size !== count || expected.some(name => !audio.includes(name))) {
    throw Error('Audio archive must contain exactly the expected numbered MP3 files.');
  }
  return expected;
}

function configureFreeDuo(plist, env, root) {
  for (const name of ['FreeDuoEnabled', 'FreeDuoManifest', 'FreeDuoDescriptor', 'FreeDuoAssetPackID']) delete plist[name];
  if (env.APPLE_FREE_DUO_TEST !== '1') return;
  if (env.APPLE_BUILD_CHANNEL !== 'internal' || !env.APPLE_ASSET_APP_GROUP) {
    throw Error('Free DUO requires the explicit internal build channel and configured Apple delivery.');
  }
  const directory = path.join(root, fs.existsSync(path.join(root, 'private/free-duo-v2')) ? 'private/free-duo-v2' : 'private/free-duo');
  const bytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  const manifest = JSON.parse(bytes);
  const metadata = manifest.metadata ?? [];
  if (!Array.isArray(metadata) || metadata.length > 1) throw Error('Invalid free syntax metadata.');
  for (const entry of metadata) {
    if (entry.file !== 'syntax.json' || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1
      || entry.bytes > 20_000_000 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid free syntax metadata.');
    const file = path.join(directory, entry.file);
    if (!fs.lstatSync(file).isFile()) throw Error('Invalid free syntax file.');
    const data = fs.readFileSync(file);
    if (data.length !== entry.bytes || hash(data) !== entry.sha256) throw Error('Prepared syntax changed.');
  }
  if (manifest.id !== 'duo-33-free-test' || ![1, 2].includes(manifest.version)
      || (manifest.version === 2 && metadata.length !== 1) || !manifest.phrases?.length
      || manifest.phrases.length > 1000 || new Set(manifest.phrases.map(p => p.file)).size !== manifest.phrases.length
      || manifest.phrases.some(p => !/^audio\/[a-z0-9-]+\.m4a$/.test(p.file) || !Number.isSafeInteger(p.bytes)
        || p.bytes <= 0 || p.bytes > 50_000_000 || !/^[a-f0-9]{64}$/.test(p.sha256)
        || typeof p.text !== 'string' || !p.text || typeof p.translation !== 'string' || !p.translation)) {
    throw Error('Prepare the immutable free-test package before prebuild.');
  }
  const packageKey = manifest.version === 2 ? syntaxKey : key;
  Object.assign(plist, { FreeDuoEnabled: true, FreeDuoAssetPackID: packageKey,
    FreeDuoManifest: bytes.toString('utf8'),
    FreeDuoDescriptor: JSON.stringify({ key: packageKey, files: [
      { file: 'manifest.json', bytes: bytes.length, sha256: hash(bytes) },
      ...manifest.phrases.map(({file, bytes, sha256}) => ({file, bytes, sha256})),
      ...metadata,
    ] }),
  });
}
module.exports = { parseDuo, audioEntries, configureFreeDuo, hash, key, syntaxKey };
