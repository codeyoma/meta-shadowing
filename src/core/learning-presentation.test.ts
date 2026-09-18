import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learningUnits } from './learning-units';
import { presentLearningUnits } from './learning-presentation';
import type { PlayableStage } from './catalog';

const phrases = [
  { text: 'We opened the window.', translation: '창문을 열었어요.' },
  { text: 'The morning was quiet.', translation: '아침은 조용했어요.' },
  { text: 'She made tea. Everyone smiled.', translation: '차를 만들었어요. 모두 웃었어요.' },
  { text: 'They sat together.', translation: '함께 앉았어요.' },
];

test('hint stages retain translations while analysis text remains first-word-only', () => {
  for (const stage of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as PlayableStage[]) {
    const units = learningUnits(phrases, stage, 2);
    const actual = presentLearningUnits(units, stage, null).map(({ text, translation }) => ({ text, translation }));
    const hints = [5, 6, 9, 10].includes(stage);
    assert.deepEqual(actual, units.map(unit => ({
      text: hints ? unit.firstWordHint : unit.text,
      translation: unit.translation,
    })));
  }
});

test('revealing a grouped hint exposes only that entire unit, retaining all other sentence hints', () => {
  const units = learningUnits(phrases, 9, 2);
  const before = structuredClone(units);
  assert.deepEqual(presentLearningUnits(units, 9, 0).map(({ text, translation }) => ({ text, translation })), [
    { text: 'We opened the window.\nThe morning was quiet.', translation: '창문을 열었어요.\n아침은 조용했어요.' },
    { text: 'She … Everyone …\nThey …', translation: '차를 만들었어요. 모두 웃었어요.\n함께 앉았어요.' },
  ]);
  assert.deepEqual(presentLearningUnits(units, 9, null).map(({ text, translation }) => ({ text, translation })), [
    { text: 'We …\nThe …', translation: '창문을 열었어요.\n아침은 조용했어요.' },
    { text: 'She … Everyone …\nThey …', translation: '차를 만들었어요. 모두 웃었어요.\n함께 앉았어요.' },
  ]);
  assert.deepEqual(units, before);
});

test('invalid reveal positions do not expose another hint unit', () => {
  const units = learningUnits(phrases, 10, 2);
  for (const index of [-1, 0.5, 2, Number.NaN]) {
    assert.deepEqual(presentLearningUnits(units, 10, index), presentLearningUnits(units, 10, null));
  }
});

test('hidden and revealed members keep identical layout text and translations', () => {
  const units = learningUnits(phrases, 9, 2);
  assert.deepEqual(presentLearningUnits(units, 9, null)[0]!.members, [
    { text: 'We opened the window.', translation: '창문을 열었어요.' },
    { text: 'The morning was quiet.', translation: '아침은 조용했어요.' },
  ]);
  assert.deepEqual(presentLearningUnits(units, 9, 0)[0]!.members, phrases.slice(0, 2));
  assert.equal(presentLearningUnits(units, 9, null)[0]!.masked, true);
  assert.equal(presentLearningUnits(units, 9, 0)[0]!.masked, false);
  assert.equal(presentLearningUnits(units, 9, 0)[1]!.masked, true);
  assert.equal(presentLearningUnits(units, 7, null)[0]!.masked, false);
});
