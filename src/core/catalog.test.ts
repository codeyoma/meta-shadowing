import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection, availableBooks, playableStage } from './catalog';

test('all six supported languages stay selected even without any available books', () => {
  const books = [{ id: 'sample', language: 'english' }];
  for (const language of ['english', 'japanese', 'chinese', 'german', 'spanish', 'french']) {
    const selected = resolveSelection(books, { language, book: 'sample' });
    assert.equal(selected.language, language);
    assert.equal(selected.book, language === 'english' ? 'sample' : null);
    assert.deepEqual(resolveSelection(books, JSON.parse(JSON.stringify(selected))), selected);
    assert.equal(availableBooks(books, language).length, language === 'english' ? 1 : 0);
  }
});

test('selection never leaks a book from another language and falls back safely after catalog changes', () => {
  const books = [{ id: 'a', language: 'english' }, { id: 'b', language: 'japanese' }];
  assert.deepEqual(resolveSelection(books, { language: 'japanese', book: 'a' }), { language: 'japanese', book: 'b' });
  assert.deepEqual(resolveSelection(books, { language: 'retired', book: 'b' }), { language: 'english', book: 'a' });
  assert.deepEqual(resolveSelection(books, null), { language: 'english', book: 'a' });
  assert.deepEqual(resolveSelection([], null), { language: 'english', book: null });
  assert.deepEqual(availableBooks(books, 'japanese'), [{ id: 'b', language: 'japanese' }]);
  assert.deepEqual(availableBooks(books, 'french'), []);
});

test('unimplemented and malformed stage links never silently start a different stage', () => {
  assert.equal(playableStage('1'), 1);
  assert.equal(playableStage('2'), 2);
  for (const param of ['3', '16', '0', '', undefined, ['1'], '01']) assert.equal(playableStage(param), null);
});
test('library selection retains an exact version and migrates legacy book-only choices without fallback from stale versions', () => {
  const versions = [
    { id: 'notes', language: 'english', packageKey: 'notes-v1' },
    { id: 'notes', language: 'english', packageKey: 'notes-v2' },
  ];
  assert.deepEqual(resolveSelection(versions, { language: 'english', book: 'notes', packageKey: 'notes-v2' }),
    { language: 'english', book: 'notes', packageKey: 'notes-v2' });
  assert.deepEqual(resolveSelection(versions, { language: 'english', book: 'notes' }),
    { language: 'english', book: 'notes', packageKey: 'notes-v1' });
  assert.deepEqual(resolveSelection(versions, { language: 'english', book: 'notes', packageKey: 'notes-v99' }),
    { language: 'english', book: null });
});
