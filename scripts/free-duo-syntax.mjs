import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import helpers from './free-duo.cjs';
import { readSentenceAnalysis } from '../src/core/sentence-analysis.ts';

/** Create a distinct immutable edition; never rewrite legacy audio or progress. */
export function prepareSyntaxEdition(legacy, syntaxFile, output) {
  if (fs.existsSync(output)) throw Error('Syntax edition already exists; no files changed.');
  const readFile = file => {
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.size > 50_000_000) throw Error('Invalid prepared file.');
      return fs.readFileSync(descriptor);
    } finally { fs.closeSync(descriptor); }
  };
  const manifest = JSON.parse(readFile(path.join(legacy, 'manifest.json')));
  if (manifest.id !== 'duo-33-free-test' || manifest.version !== 1 || manifest.phrases.length !== 560)
    throw Error('Expected the prepared legacy test edition.');
  const syntax = readFile(syntaxFile);
  if (syntax.length > 20_000_000) throw Error('Analysis is too large.');
  const sentences = readSentenceAnalysis(syntax.toString('utf8'), manifest.phrases, 'en', [0]);
  const files = new Set();
  for (const entry of manifest.phrases) {
    if (!/^audio\/phrase-[0-9]{3}\.m4a$/.test(entry.file) || files.has(entry.file)) throw Error('Invalid audio entry.');
    files.add(entry.file);
    const bytes = readFile(path.join(legacy, entry.file));
    if (bytes.length !== entry.bytes || helpers.hash(bytes) !== entry.sha256) throw Error('Legacy audio failed integrity verification.');
  }
  const metadata = [{ file: 'syntax.json', bytes: syntax.length, sha256: helpers.hash(syntax) }];
  const staging = fs.mkdtempSync(path.join(path.dirname(output), 'syntax-prepare-'));
  try {
    fs.mkdirSync(path.join(staging, 'audio'));
    for (const entry of manifest.phrases) {
      const bytes = readFile(path.join(legacy, entry.file));
      if (bytes.length !== entry.bytes || helpers.hash(bytes) !== entry.sha256) throw Error('Legacy audio changed during preparation.');
      fs.writeFileSync(path.join(staging, entry.file), bytes, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(staging, 'syntax.json'), syntax, { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({ ...manifest, version: 2, metadata }), { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'AssetPack.json'), JSON.stringify({ assetPackID: helpers.syntaxKey,
      downloadPolicy: { onDemand: {} }, platforms: ['iOS'],
      fileSelectors: [{ file: 'manifest.json' }, ...manifest.phrases.map(({ file }) => ({ file })), { file: 'syntax.json' }],
    }), { flag: 'wx' });
    fs.renameSync(staging, output);
  } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
  return { entries: manifest.phrases.length, firstUnitSentences: sentences.length, syntaxBytes: syntax.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw Error('Supply the analysis file.');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const output = path.join(root, 'private/free-duo-v2');
    const result = prepareSyntaxEdition(path.join(root, 'private/free-duo'), process.argv[2], output);
    const archive = spawnSync('xcrun', ['ba-package', 'AssetPack.json', '-o', 'DuoFreeTest.aar'], { cwd: output, stdio: 'pipe' });
    if (archive.status !== 0) throw Error('Archive generation failed; prepared files remain available.');
    console.log(JSON.stringify({ ...result, version: 2, archiveCreated: true }));
  } catch { console.error('Syntax edition preparation failed. Existing installation and progress were not changed.'); process.exitCode = 1; }
}
