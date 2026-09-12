// Local noncommercial test speech only; replace with cleared production audio for distribution.
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../assets/sample/', import.meta.url));
const phrases = JSON.parse(readFileSync(join(root, 'phrases.json'), 'utf8'));
mkdirSync(join(root, 'audio'), { recursive: true });
const manifest = { id: 'morning-notes', version: 1, title: 'Morning Notes', language: 'English', phrases: [] };
for (const [i, phrase] of phrases.entries()) {
  const file = `audio/phrase-${String(i + 1).padStart(2, '0')}.m4a`;
  const intermediate = join(root, `audio/phrase-${i + 1}.aiff`);
  execFileSync('/usr/bin/say', ['-v', 'Samantha', '-r', '150', '-o', intermediate, phrase.text]);
  execFileSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', intermediate, join(root, file)]);
  unlinkSync(intermediate);
  const bytes = readFileSync(join(root, file));
  manifest.phrases.push({ ...phrase, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${manifest.phrases.length} controlled spoken test clips.`);
