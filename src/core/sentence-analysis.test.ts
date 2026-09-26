import test from 'node:test';
import assert from 'node:assert/strict';
import { readSentenceAnalysis } from './sentence-analysis';
import { syntaxFixture, syntaxPhrases } from '../test-support/syntax-fixture';
import { loadCurrentAnalysis } from './current-analysis';
import { LearningContext } from './learning-context';
import { Journal } from './journal';
import { DatabaseSync } from 'node:sqlite';
import { createSession } from './session';
import { learningUnits } from './learning-units';

test('installed syntax maps source blocks to individual sentences using its own UTF16 offsets', () => {
  const sentences = readSentenceAnalysis(JSON.stringify(syntaxFixture()), syntaxPhrases, 'en', [0]);
  assert.deepEqual(sentences.map(s => s.text), ['Birds fly.', 'Fish swim.']);
  assert.deepEqual(sentences[1]!.tokens.map(t => [t.text, t.offset, t.head, t.pos]),
    [['Fish', 0, 1, 'NOUN'], ['swim', 5, 1, 'VERB'], ['.', 9, 1, 'PUNCT']]);
  assert.deepEqual(sentences.map(s => s.id), ['1:0', '1:1']);
});

test('current-unit analysis exposes full source in hint/reveal stages without changing saved learning', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = new Journal({ exec: sql => db.exec(sql), run: (sql, ...args) => { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T });
    const pack = { language: 'english', manifest: { id: 'syntax-test', version: 1, title: 'Test',
      phrases: syntaxPhrases.map(p => ({ ...p, file: 'audio/one.m4a', bytes: 1, sha256: 'a'.repeat(64) })) } };
    const context = new LearningContext(pack, journal);
    for (const stage of [5, 11, 15] as const) {
      const saved = createSession({ runId: `run-${stage}`, stage, phraseCount: 1, mode: 'manual', rate: 1 });
      context.save(saved);
      const scope = { stage, run: saved.runId, phrase: 0 };
      let allowed = true;
      const read = async () => JSON.stringify(syntaxFixture());
      const result = await loadCurrentAnalysis(context, scope, () => allowed, read);
      assert.equal(result?.[0]?.text, 'Birds fly.');
      assert.deepEqual(context.load(stage), saved);
      assert.equal(journal.progress.summary('english').xp, 0);
      assert.equal(await loadCurrentAnalysis(context, { ...scope, run: 'stale' }, () => true, read), null);
      assert.equal(await loadCurrentAnalysis(context, scope, () => allowed, async () => { allowed = false; return read(); }), null);
    }
  } finally { db.close(); }
});

test('incomplete tokens cannot silently omit part of the target sentence', () => {
  const doc = syntaxFixture();
  doc.entries[0]!.analysis.tokens[0]!.text.content = 'Bird';
  assert.throws(() => readSentenceAnalysis(JSON.stringify(doc), syntaxPhrases, 'en', [0]));
});

test('invalid schema, language, source alignment, offsets and cross-sentence heads are rejected', () => {
  const changes: ((d: ReturnType<typeof syntaxFixture>) => void)[] = [
    d => { d.schemaVersion = 2; }, d => { d.language = 'ko'; }, d => { d.encodingType = 'UTF8'; },
    d => { d.complete = false; }, d => { d.entryCount = 2; }, d => { d.entries[0]!.phraseNumber = 2; },
    d => { d.entries[0]!.text = 'Other source'; }, d => { d.entries[0]!.status = 'failed'; },
    d => { d.entries[0]!.analysis.language = 'ko'; },
    d => { d.entries[0]!.analysis.tokens[0]!.text.beginOffset = -1; },
    d => { d.entries[0]!.analysis.tokens[0]!.dependencyEdge.headTokenIndex = 99; },
    d => { d.entries[0]!.analysis.tokens[0]!.dependencyEdge.headTokenIndex = 4; },
    d => { d.entries[0]!.analysis.sentences[1]!.text.beginOffset = 0; },
  ];
  for (const change of changes) {
    const doc = syntaxFixture(); change(doc);
    assert.throws(() => readSentenceAnalysis(JSON.stringify(doc), syntaxPhrases, 'en', [0]));
  }
  for (const indices of [[], [-1], [0, 0], [1], [0.5]]) {
    assert.throws(() => readSentenceAnalysis(JSON.stringify(syntaxFixture()), syntaxPhrases, 'en', indices));
  }
  assert.throws(() => readSentenceAnalysis('{', syntaxPhrases, 'en', [0]));
});

test('grouped units preserve original source indices and grammatical sentence order', () => {
  const doc = syntaxFixture();
  doc.entries.push({ ...structuredClone(doc.entries[0]!), phraseNumber: 2 }); doc.entryCount = 2;
  const phrases = [...syntaxPhrases, ...syntaxPhrases];
  const unit = learningUnits(phrases, 7, 2)[0]!;
  assert.deepEqual(readSentenceAnalysis(JSON.stringify(doc), phrases, 'en', unit.sourceIndices).map(s => s.id),
    ['1:0', '1:1', '2:0', '2:1']);
});
