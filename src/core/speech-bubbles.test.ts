import assert from 'node:assert/strict';
import test from 'node:test';
import { speechBubbles } from './speech-bubbles';

test('pairs quoted utterances with translations without splitting internal sentences', () => {
  assert.deepEqual(speechBubbles({
    text: `"I'm soaked with sweat."\n"Stand back! You stink. Take a shower."`,
    translation: '"땀으로 흠뻑 젖었어."\n"저리가! 냄새나. 샤워해."',
  }), [
    { text: "I'm soaked with sweat.", translation: '땀으로 흠뻑 젖었어.' },
    { text: 'Stand back! You stink. Take a shower.', translation: '저리가! 냄새나. 샤워해.' },
  ]);
});

test('unquoted and ambiguous content stays together without losing or mispairing text', () => {
  const cases = [
    { text: 'Stand back! You stink. Take a shower.', translation: '저리가! 냄새나. 샤워해.' },
    { text: 'He said "Hello." Then left.', translation: '그는 인사하고 떠났어.' },
    { text: '"Hello." "Goodbye."', translation: '"안녕."' },
    { text: '"Hello." trailing text', translation: '"안녕."' },
    { text: '"Hello.', translation: '"안녕."' },
  ];
  for (const phrase of cases) assert.deepEqual(speechBubbles(phrase), [phrase]);
});

test('accepts typographic quotation marks and preserves order and source data', () => {
  const phrase = Object.freeze({ text: '“Hello!”\n“Goodbye.”', translation: '“안녕!”\n“잘 가.”' });
  assert.deepEqual(speechBubbles(phrase), [
    { text: 'Hello!', translation: '안녕!' }, { text: 'Goodbye.', translation: '잘 가.' },
  ]);
  assert.equal(phrase.text, '“Hello!”\n“Goodbye.”');
});
