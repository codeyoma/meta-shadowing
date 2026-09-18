import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedSpeechBubbles } from './grouped-speech';
test('ordinary grouped narration stays inside one bubble with distinct member blocks', () => {
  const members = [{ text: 'Open the door.', translation: '문을 여세요.' }, { text: 'Close the window.', translation: '창문을 닫으세요.' }];
  assert.deepEqual(groupedSpeechBubbles(members), [members]);
});
test('quoted dialogue preserves utterance translation pairing across source members', () => {
  assert.deepEqual(groupedSpeechBubbles([
    { text: '"Hello." "Good morning."', translation: '"안녕." "좋은 아침."' },
    { text: '"Goodbye." "See you."', translation: '"잘 가." "또 봐."' },
  ]), [[{ text: 'Hello.', translation: '안녕.' }], [{ text: 'Good morning.', translation: '좋은 아침.' }],
    [{ text: 'Goodbye.', translation: '잘 가.' }], [{ text: 'See you.', translation: '또 봐.' }]]);
});
test('a single paired quoted utterance retains the existing wrapper normalization', () => {
  assert.deepEqual(groupedSpeechBubbles([
    { text: '"Hello."', translation: '"안녕."' },
    { text: 'Good morning.', translation: '좋은 아침.' },
  ]), [[{ text: 'Hello.', translation: '안녕.' }, { text: 'Good morning.', translation: '좋은 아침.' }]]);
});
