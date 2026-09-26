import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntaxFixture, syntaxPhrases } from '../src/test-support/syntax-fixture';
// Preparation is an executable module shared with the local package command.
import { prepareSyntaxEdition } from './free-duo-syntax.mjs';

test('syntax edition verifies all source entries, preserves legacy bytes, and refuses replacement', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syntax-edition-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'legacy');
  fs.mkdirSync(path.join(legacy, 'audio'), { recursive: true });
  const audio = Buffer.from('synthetic audio fixture');
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const phrases = Array.from({ length: 560 }, (_, i) => {
    const file = `audio/phrase-${String(i + 1).padStart(3, '0')}.m4a`;
    fs.writeFileSync(path.join(legacy, file), audio);
    return { ...syntaxPhrases[0], file, bytes: audio.length, sha256: hash(audio) };
  });
  const manifest = JSON.stringify({ id: 'duo-33-free-test', version: 1, phrases });
  fs.writeFileSync(path.join(legacy, 'manifest.json'), manifest);
  const fixture = syntaxFixture();
  fixture.entries = phrases.map((_, i) => ({ ...structuredClone(fixture.entries[0]!), phraseNumber: i + 1 }));
  fixture.entryCount = 560;
  const syntax = path.join(root, 'text-syntax.json');
  fs.writeFileSync(syntax, JSON.stringify(fixture));
  const output = path.join(root, 'v2');
  assert.equal(prepareSyntaxEdition(legacy, syntax, output).entries, 560);
  assert.equal(fs.readFileSync(path.join(legacy, 'manifest.json'), 'utf8'), manifest);
  const upgraded = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.metadata[0].sha256, hash(fs.readFileSync(syntax)));
  assert.deepEqual(fs.readFileSync(path.join(output, phrases[559]!.file)), audio);
  assert.throws(() => prepareSyntaxEdition(legacy, syntax, output));
  fixture.entries[559]!.text = 'Mismatched source';
  fs.writeFileSync(syntax, JSON.stringify(fixture));
  assert.throws(() => prepareSyntaxEdition(legacy, syntax, path.join(root, 'invalid')));
  assert.equal(fs.existsSync(path.join(root, 'invalid')), false);
  fixture.entries[559]!.text = fixture.entries[0]!.text;
  fs.writeFileSync(syntax, JSON.stringify(fixture));
  fs.writeFileSync(path.join(legacy, phrases[559]!.file), 'corrupt');
  assert.throws(() => prepareSyntaxEdition(legacy, syntax, path.join(root, 'corrupt')));
  assert.equal(fs.existsSync(path.join(root, 'corrupt')), false);
});
