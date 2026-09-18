import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browsedLibrarySnapshot, librarySnapshot } from './library-resume';

const books = [{ id: 'a', language: 'english', packageKey: 'a-v1' }, { id: 'b', language: 'english', packageKey: 'b-v1' }];
const a = { language: 'english', book: 'a', packageKey: 'a-v1' };
const b = { language: 'english', book: 'b', packageKey: 'b-v1' };

test('startup offers most recent learning separately from later browsing and no-op updates retain it', () => {
  const learning = { ...a, stamp: '10' };
  const first = librarySnapshot(books, null, JSON.stringify(b), learning);
  assert.deepEqual(first.selection, a);
  assert.equal(librarySnapshot(books, first, JSON.stringify(b), learning), first);
  const browsed = librarySnapshot(books, first, JSON.stringify(a), learning);
  const second = librarySnapshot(books, browsed, JSON.stringify(b), learning);
  assert.deepEqual(second.selection, b);
  assert.deepEqual(librarySnapshot(books, null, JSON.stringify(b), learning).selection, a);
});

test('later actual learning changes the resume offer without mutating browsing preferences', () => {
  const browsing = JSON.stringify(a);
  const previous = librarySnapshot(books, null, browsing, { ...a, stamp: '10' });
  const next = librarySnapshot(books, previous, browsing, { ...b, stamp: '11' });
  assert.deepEqual(next.selection, b); assert.equal(next.browsing, browsing);
  assert.equal(librarySnapshot(books, next, browsing, { ...b, stamp: '11' }), next);
});

test('unsupported package versions remain unavailable instead of using another version', () => {
  const next = librarySnapshot(books, null, JSON.stringify(b), { ...a, packageKey: 'a-v99', stamp: '10' });
  assert.equal(next.selection.book, null);
});

test('remote learning waits for the next safe entry instead of changing an active browse', () => {
  const first = librarySnapshot(books, null, JSON.stringify(a), { ...a, stamp: '10' });
  const next = { ...b, stamp: '11' };
  assert.equal(librarySnapshot(books, first, JSON.stringify(a), next, false), first);
  assert.deepEqual(librarySnapshot(books, first, JSON.stringify(a), next, true).selection, b);
});

test('explicitly selecting the already-persisted browsed book does not bounce back to the resume offer', () => {
  const learning = { ...a, stamp: '10' };
  const offered = librarySnapshot(books, null, JSON.stringify(b), learning);
  const selected = browsedLibrarySnapshot(offered, b);
  assert.deepEqual(librarySnapshot(books, selected, JSON.stringify(b), learning, false).selection, b);
});
