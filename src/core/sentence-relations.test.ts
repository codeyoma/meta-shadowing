import test from 'node:test';
import assert from 'node:assert/strict';
import { relationsForToken } from './sentence-relations';
import type { AnalysisSentence } from './sentence-analysis';

const sentence: AnalysisSentence = { id: '1:0', sourceIndex: 0, text: 'Birds watch birds.', tokens: [
  { text: 'Birds', offset: 0, pos: 'NOUN', head: 1, relation: 'NSUBJ' },
  { text: 'watch', offset: 6, pos: 'VERB', head: 1, relation: 'ROOT' },
  { text: 'birds', offset: 12, pos: 'NOUN', head: 1, relation: 'DOBJ' },
  { text: '.', offset: 17, pos: 'PUNCT', head: 1, relation: 'P' },
] };

test('selecting a repeated word retains token identity and only its direct head-to-dependent relation', () => {
  const result = relationsForToken(sentence, 2);
  assert.deepEqual(result.connected, [1, 2]);
  assert.deepEqual(result.edges.map(e => [e.head, e.dependent, e.label, e.name]), [[1, 2, 'DOBJ', '직접 목적어']]);
  assert.equal(result.root, false);
  assert.match(result.edges[0]!.explanation, /대상/);
});

test('overview includes every relationship; root selection excludes self arrows', () => {
  const result = relationsForToken(sentence, 1);
  assert.equal(result.root, true);
  assert.deepEqual(result.edges.map(e => [e.head, e.dependent]), [[1, 0], [1, 2], [1, 3]]);
  assert.equal(result.edges[0]!.name, '주어');
  assert.equal(result.edges[2]!.name, '문장 부호');
  assert.deepEqual(relationsForToken(sentence, null).edges.map(e => [e.head, e.dependent]), [[1, 0], [1, 2], [1, 3]]);
  assert.deepEqual(relationsForToken(sentence, null).connected, []);
});

test('unknown labels remain intact; invalid and cross-sentence heads never produce an arrow', () => {
  const altered = { ...sentence, tokens: sentence.tokens.map(t => ({ ...t })) };
  altered.tokens[0]!.relation = 'FUTURE_LABEL';
  altered.tokens[2]!.head = 100;
  altered.tokens[3]!.head = -1;
  const result = relationsForToken(altered, 0);
  assert.equal(result.edges[0]!.label, 'FUTURE_LABEL');
  assert.equal(result.edges[0]!.name, '기타 관계');
  assert.deepEqual(relationsForToken(altered, 2).edges, []);
  assert.deepEqual(relationsForToken(altered, 3).edges, []);
  assert.deepEqual(relationsForToken(altered, 100).connected, []);
  altered.tokens[0]!.relation = 'constructor';
  assert.equal(relationsForToken(altered, 0).edges[0]!.label, 'constructor');
});

test('long-distance and crossing source edges retain direction without transitive or invented links', () => {
  const crossing: AnalysisSentence = { id: '2:0', sourceIndex: 1, text: 'A B C D E', tokens: [
    { text: 'A', offset: 0, pos: 'X', head: 3, relation: 'DEP' },
    { text: 'B', offset: 2, pos: 'X', head: 4, relation: 'DEP' },
    { text: 'C', offset: 4, pos: 'X', head: 3, relation: 'DEP' },
    { text: 'D', offset: 6, pos: 'X', head: 4, relation: 'DEP' },
    { text: 'E', offset: 8, pos: 'X', head: 4, relation: 'ROOT' },
  ] };
  assert.deepEqual(relationsForToken(crossing, 3).edges.map(e => [e.head, e.dependent]), [[3, 0], [3, 2], [4, 3]]);
  assert.deepEqual(relationsForToken(crossing, 1).edges.map(e => [e.head, e.dependent]), [[4, 1]]);
});
