import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as units from './learning-units';
import { isFirstWordStage, isGroupedStage } from './catalog';

const phrases = ['“Hello there!” Next sentence.', 'Good morning.', 'Come here.', 'Stay awhile.', 'Last one.']
  .map(text => ({ text, translation: '번역 비밀' }));
test('grouping preserves blocks, includes a short remainder and uses source indices', () => {
  assert.equal(typeof units.learningUnits, 'function');
  assert.deepEqual(units.learningUnits(phrases.slice(0, 4), 7, 2).map(u => u.sourceIndices), [[0, 1], [2, 3]]);
  assert.deepEqual(units.learningUnits(phrases, 9, 2).map(u => u.sourceIndices), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(units.learningUnits(phrases, 8, 3).map(u => u.sourceIndices), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(units.learningUnits(phrases, 10, 4).map(u => u.sourceIndices), [[0, 1, 2, 3], [4]]);
  for (const stage of [1, 2, 3, 4, 5, 6] as const) assert.equal(units.learningUnits(phrases, stage, 4).length, 5);
  const first = units.learningUnits(phrases, 9, 2)[0]!;
  assert.equal(first.text, '“Hello there!” Next sentence.\nGood morning.');
  assert.equal(first.translation, '번역 비밀\n번역 비밀');
  assert.equal(first.firstWordHint, 'Hello … Next …\nGood …');
});
test('sentence hints handle quotes, sentence punctuation and empty source without translations', () => {
  assert.equal(typeof units.firstWordHint, 'function');
  assert.equal(units.firstWordHint('"Are you ready?" “Yes, I am!” Let’s go… Fine.'), 'Are … Yes … Let’s … Fine …');
  assert.equal(units.firstWordHint('   '), '');
  assert.equal(units.firstWordHint('こんにちは。元気ですか？はい！'), 'こんにちは … 元気ですか … はい …');
  assert.equal(units.firstWordHint('Wait... Really?! Okay.'), 'Wait … Really … Okay …');
  assert.equal(units.firstWordHint('Dr. Smith met J. Jones. They left at 3.5 hours.'), 'Dr … They …');
  for (let stage = 1; stage <= 16; stage++) {
    assert.equal(isGroupedStage(stage), [7, 8, 9, 10].includes(stage));
    assert.equal(isFirstWordStage(stage), [5, 6, 9, 10].includes(stage));
  }
});
