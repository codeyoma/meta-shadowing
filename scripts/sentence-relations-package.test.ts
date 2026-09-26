import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSentenceAnalysis } from '../src/core/sentence-analysis';
import { relationsForToken } from '../src/core/sentence-relations';

const directory = process.env.SENTENCE_ANALYSIS_PACKAGE_DIR;
test('installed DUO analysis supports every token selection without escaping its sentence', { skip: !directory }, () => {
  // Read privately; failures deliberately omit source text and filesystem paths.
  let manifest: { phrases: { text: string }[] }, raw: string;
  try {
    manifest = JSON.parse(readFileSync(join(directory!, 'manifest.json'), 'utf8'));
    raw = readFileSync(join(directory!, 'syntax.json'), 'utf8');
  } catch { throw Error('private-analysis-fixture-unavailable'); }
  assert.equal(manifest.phrases.length, 560);
  const sentences = readSentenceAnalysis(raw, manifest.phrases, 'en', manifest.phrases.map((_, i) => i));
  assert.equal(sentences.length, 811);
  assert.equal(sentences.reduce((sum, s) => sum + s.tokens.length, 0), 8795);
  for (const sentence of sentences) for (let selected = 0; selected < sentence.tokens.length; selected++) {
    const result = relationsForToken(sentence, selected);
    assert.ok(result.connected.includes(selected));
    assert.equal(result.edges.length, sentence.tokens.filter((token, index) => token.head !== index
      && (index === selected || token.head === selected)).length);
    for (const edge of result.edges) {
      assert.ok(edge.head >= 0 && edge.head < sentence.tokens.length && edge.head !== edge.dependent);
      assert.ok(edge.dependent === selected || edge.head === selected);
      assert.equal(edge.head, sentence.tokens[edge.dependent]!.head);
      assert.equal(edge.label, sentence.tokens[edge.dependent]!.relation);
      assert.ok(edge.name.length > 0 && edge.explanation.length > 0);
    }
  }
});
