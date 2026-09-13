import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only these already-public, controlled sample files may enter this archive.
// Never recurse through a content directory or read private commercial books.
const root = fileURLToPath(new URL('../', import.meta.url));
const assetPackID = process.env.APPLE_SAMPLE_ASSET_PACK_ID?.trim();
if (!assetPackID || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(assetPackID)) {
  throw Error('Set APPLE_SAMPLE_ASSET_PACK_ID before packaging.');
}
const manifest = JSON.parse(await readFile(path.join(root, 'assets/sample/manifest.json'), 'utf8'));
const specification = JSON.parse(await readFile(path.join(root, 'assets/sample/delivery.json'), 'utf8'));
const files = [specification.metadata, ...manifest.phrases];
await mkdir(path.join(root, 'private/apple-assets'), { recursive: true });
const output = await mkdtemp(path.join(root, 'private/apple-assets/sample-'));
for (const entry of files) {
  if (entry.file !== 'manifest.json' && !/^audio\/[a-z0-9-]+\.m4a$/.test(entry.file)) throw Error('Unsafe sample path.');
  const source = path.join(root, 'assets/sample', entry.file);
  const bytes = await readFile(source);
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
    throw Error('Sample does not match the pinned version. Do not replace an existing version.');
  }
  const destination = path.join(output, entry.file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
await writeFile(path.join(output, 'AssetPack.json'), JSON.stringify({
  assetPackID, downloadPolicy: { onDemand: {} },
  platforms: ['iOS'],
  fileSelectors: files.map(entry => ({ file: entry.file })),
}, null, 2));
const result = spawnSync('xcrun', ['ba-package', 'AssetPack.json', '-o', 'Sample.aar'], { cwd: output, stdio: 'inherit' });
if (result.error || result.status !== 0) throw Error('Apple sample packaging failed.');
console.log('Created the controlled sample archive under private/apple-assets. Nothing was uploaded.');
