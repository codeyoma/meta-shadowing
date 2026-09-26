import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import helpers from './free-duo.cjs';
import { readSentenceAnalysis } from '../src/core/sentence-analysis.ts';

// Explicit local input only. Generated private text/audio never enter source control.
const root = fileURLToPath(new URL('../', import.meta.url));
const input = process.argv[2];
if (!input || process.argv.length !== 3) throw Error('Supply the DUO source directory.');
const source = fs.realpathSync(input);
const output = path.join(root, 'private/free-duo');
if (fs.existsSync(output)) throw Error('Prepared version already exists; do not overwrite an immutable pack.');
const info = JSON.parse(fs.readFileSync(path.join(source, 'info.json'), 'utf8'));
if (Number(info.phrase) !== 560 || Number(info.section) !== 45 || info.language !== 'en') throw Error('Unexpected DUO metadata.');
const phrases = helpers.parseDuo(fs.readFileSync(path.join(source, 'text.txt'), 'utf8'), 560, 45);
const syntaxPath = path.join(source, 'text-syntax.json');
const syntax = fs.existsSync(syntaxPath) ? fs.readFileSync(syntaxPath) : null;
if (syntax) readSentenceAnalysis(syntax.toString('utf8'), phrases, 'en', [0]);
const metadata = syntax ? [{ file: 'syntax.json', bytes: syntax.length, sha256: helpers.hash(syntax) }] : [];
const zip = path.join(source, 'audio.zip');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { maxBuffer: 50_000_000, ...options });
  if (result.error || result.status !== 0) throw Error(`${path.basename(command)} failed; no package published.`);
  return result.stdout;
}
const entries = helpers.audioEntries(run('/usr/bin/unzip', ['-Z', '-1', zip]).toString().trim().split('\n'), 560);
fs.mkdirSync(path.join(root, 'private'), { recursive: true });
const staging = fs.mkdtempSync(path.join(root, 'private/duo-prepare-'));
fs.mkdirSync(path.join(staging, 'audio'));
for (const [i, name] of entries.entries()) {
  const mp3 = path.join(staging, 'input.mp3');
  fs.writeFileSync(mp3, run('/usr/bin/unzip', ['-p', zip, name]));
  const file = `audio/phrase-${String(i + 1).padStart(3, '0')}.m4a`;
  run('/usr/bin/afconvert', [mp3, path.join(staging, file), '-f', 'm4af', '-d', 'aac', '-b', '64000']);
  const data = fs.readFileSync(path.join(staging, file));
  Object.assign(phrases[i], { file, bytes: data.length, sha256: helpers.hash(data) });
  if ((i + 1) % 100 === 0) console.log(`Prepared ${i + 1}/560 audio files.`);
}
fs.unlinkSync(path.join(staging, 'input.mp3'));
if (syntax) fs.writeFileSync(path.join(staging, 'syntax.json'), syntax);
fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({
  id: 'duo-33-free-test', version: 1, title: 'DUO 3.3 · 무료 테스트', phrases, ...(syntax ? { metadata } : {}),
}));
fs.writeFileSync(path.join(staging, 'AssetPack.json'), JSON.stringify({
  assetPackID: helpers.key, downloadPolicy: { onDemand: {} }, platforms: ['iOS'],
  fileSelectors: [{ file: 'manifest.json' }, ...phrases.map(({file}) => ({file})), ...metadata.map(({file}) => ({file}))],
}));
run('xcrun', ['ba-package', 'AssetPack.json', '-o', 'DuoFreeTest.aar'], { cwd: staging });
fs.renameSync(staging, output);
console.log('Prepared 560 phrases / 45 sections and DuoFreeTest.aar under ignored private/free-duo. Nothing uploaded.');
