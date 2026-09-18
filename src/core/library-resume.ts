import { resolveSelection, type CatalogBook, type Selection } from './catalog';

export type LibrarySnapshot = { selection: Selection; browsing: string | null; learningStamp: string | null };
type LearningSelection = Selection & { stamp: string };

export function browsedLibrarySnapshot(previous: LibrarySnapshot | null, selection: Selection): LibrarySnapshot {
  return { selection, browsing: JSON.stringify(selection), learningStamp: previous?.learningStamp ?? null };
}

/** Resume evidence and browsing choice have independent lifetimes and ordering. */
export function librarySnapshot(books: readonly CatalogBook[], previous: LibrarySnapshot | null,
  browsing: string | null, learning: LearningSelection | null, allowResume = true): LibrarySnapshot {
  const freshLearning = learning && learning.stamp !== previous?.learningStamp;
  if (freshLearning && (allowResume || previous?.learningStamp == null)) {
    return { selection: resolveSelection(books, learning), browsing, learningStamp: learning.stamp };
  }
  if (previous && previous.browsing === browsing) return previous;
  return { selection: resolveSelection(books, browsing ? JSON.parse(browsing) : null), browsing,
    learningStamp: previous?.learningStamp ?? null };
}
