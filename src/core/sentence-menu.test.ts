import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceSections, initiallyCollapsedSections } from './sentence-menu';
import { learningUnits } from './learning-units';
const phrases = [
  { text: 'Open the door.', translation: '문을 여세요.', section: 1 },
  { text: 'Close the window.', translation: '창문을 닫으세요.', section: 1 },
  { text: 'Take a break.', translation: '쉬세요.', section: 2 },
];
test('section headers retain original order, source indices and saved group membership', () => {
  assert.deepEqual(sentenceSections(phrases, learningUnits(phrases, 7, 2)).map(group => ({
    title: group.title, indices: group.rows.map(row => row.sourceIndex), units: group.rows.map(row => row.unitIndex),
  })), [ { title: 'Section 1', indices: [0, 1], units: [0, 0] }, { title: 'Section 2', indices: [2], units: [1] } ]);
});
test('headerless sources remain immediately visible in one flat group', () => {
  const flat = phrases.map(({ text, translation }) => ({ text, translation }));
  const groups = sentenceSections(flat, learningUnits(flat, 1));
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.title, null);
  assert.deepEqual(groups[0]!.rows.map(row => row.sourceIndex), [0, 1, 2]);
});
test('sectioned books initially show headers while headerless passages remain visible', () => {
  const groups = sentenceSections([...phrases, { text: 'Goodbye.', translation: '잘 가요.' }], learningUnits([...phrases, { text: 'Goodbye.', translation: '잘 가요.' }], 1));
  assert.deepEqual([...initiallyCollapsedSections(groups)], [0, 1]);
});

test('opening all sentences expands the current unit section without expanding unrelated sections', () => {
  const groups = sentenceSections(phrases, learningUnits(phrases, 1));
  assert.deepEqual([...initiallyCollapsedSections(groups, 2)], [0]);
  assert.deepEqual([...initiallyCollapsedSections(groups, 0)], [1]);
  assert.deepEqual([...initiallyCollapsedSections(groups, -1)], [0, 1]);
});
