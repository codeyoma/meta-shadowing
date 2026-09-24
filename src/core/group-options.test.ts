import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { Journal } from './journal';
import { LearningContext } from './learning-context';
import { createGroupedSession } from './session';
import { isGroupSize } from './learning-units';

test('the learning menu shows the active size and applies the picker to that checkpoint, not only defaults', () => {
  const source = ts.createSourceFile('player-options.tsx', readFileSync(new URL('../app/player-options.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.FunctionDeclaration | undefined, editorSettings: ts.JsxExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'changePreference') handler = node;
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'LearningPreferenceSection') {
      const attribute = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'settings');
      if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) editorSettings = attribute.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const db = new DatabaseSync(':memory:');
  try {
    const journal = new Journal({ exec: sql => db.exec(sql), run: (sql, ...args) => { db.prepare(sql).run(...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T });
    const pack = { language: 'english', manifest: { id: 'options-fixture', version: 1, title: 'Generated options',
      phrases: Array.from({ length: 8 }, (_, i) => ({ text: `Line ${i}.`, translation: '문장', file: `audio/${i}.m4a`, bytes: 1, sha256: 'a'.repeat(64) })) } };
    const context = new LearningContext(pack, journal);
    const checkpoint = createGroupedSession({ runId: 'before', stage: 9, sourcePhraseCount: 8, groupSize: 3, mode: 'manual', rate: 1 });
    context.save(checkpoint);
    const settings = { mode: 'manual', rate: 1, groupSize: 4 };
    const module = { exports: {} as { change(patch: unknown): void; displayed(): { groupSize: number } } };
    const sandbox = { module, settings, checkpoint, rate: 1, stage: 9, pack, run: 'before', scopeValid: () => true,
      LearningContext, getJournal: () => journal, isGroupSize, randomUUID: () => 'after',
      sentenceEntry: { cancel() {} }, router: { setParams({ run }: { run: string }) { sandbox.run = run; } },
      setCheckpoint(next: typeof checkpoint) { sandbox.checkpoint = next; }, setRevision() {},
      Alert: { alert() { assert.fail('Unexpected regrouping error'); } },
      saveSettings() { assert.fail('The active group editor must not silently overwrite defaults'); } };
    runInNewContext(ts.transpileModule(`${handler!.getText(source)}
      module.exports = { change: changePreference, displayed: () => (${editorSettings!.expression!.getText(source)}) };`,
      { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
    assert.equal(module.exports.displayed().groupSize, 3);
    module.exports.change({ groupSize: 4 });
    assert.equal(module.exports.displayed().groupSize, 4);
    assert.deepEqual(context.units(context.load(9)!).map(unit => unit.sourceIndices), [[0, 1, 2, 3], [4, 5, 6, 7]]);
    assert.equal(journal.progress.summary('english').xp, 0);
    module.exports.change({ groupSize: 4 });
    assert.equal(context.load(9)!.runId, 'after');
  } finally { db.close(); }
});
