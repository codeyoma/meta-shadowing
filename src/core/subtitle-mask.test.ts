import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtitleSpans } from './subtitle-mask';

test('mask preserves exact text and whitespace while revealing each sentence first word', () => {
  const text = '“Please give me time.”\nLearning a little helps! Let’s go… Fine.';
  const spans = subtitleSpans(text);
  assert.equal(spans.map(s => s.text).join(''), text);
  assert.deepEqual(spans.filter(s => s.hint).map(s => s.text), ['Please', 'Learning', 'Let’s', 'Fine']);
  assert.ok(spans.some(s => !s.hint && s.text.includes('\n')));
});

test('titles, initials and decimal points do not reveal extra words', () => {
  const text = 'Dr. Smith met J. Jones. They left at 3.5 hours.';
  const spans = subtitleSpans(text);
  assert.equal(spans.map(s => s.text).join(''), text);
  assert.deepEqual(spans.filter(s => s.hint).map(s => s.text), ['Dr', 'They']);
});

test('unicode, repeated punctuation and blank sources retain their original characters', () => {
  for (const [text, words] of [
    ['こんにちは。元気ですか？はい！', ['こんにちは', '元気ですか', 'はい']],
    ['Wait... Really?! Okay.', ['Wait', 'Really', 'Okay']],
    ['  Café stays.\nÉlan returns.', ['Café', 'Élan']],
    ['   ', []], ['', []],
  ] as const) {
    const spans = subtitleSpans(text);
    assert.equal(spans.map(s => s.text).join(''), text);
    assert.deepEqual(spans.filter(s => s.hint).map(s => s.text), words);
  }
});
