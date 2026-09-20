export type CatalogBook = { id: string; language: string; packageKey?: string };
export type Selection = { language: string; book: string | null; packageKey?: string };
export const languages = [
  { id: 'english', name: '영어', flag: '🇬🇧', displayCode: 'EN' },
  { id: 'japanese', name: '일본어', flag: '🇯🇵', displayCode: 'JP' },
  { id: 'chinese', name: '중국어', flag: '🇨🇳', displayCode: 'CN' },
  { id: 'german', name: '독일어', flag: '🇩🇪', displayCode: 'DE' },
  { id: 'spanish', name: '스페인어', flag: '🇪🇸', displayCode: 'ES' },
  { id: 'french', name: '프랑스어', flag: '🇫🇷', displayCode: 'FR' },
] as const;
export type PlayableStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export function isPlayableStage(value: unknown): value is PlayableStage {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 16;
}
export function isRevealStage(stage: number): boolean { return isPlayableStage(stage) && stage >= 11; }
export function isGroupedStage(stage: number): boolean { return stage >= 7 && stage <= 10 && isPlayableStage(stage); }
export function isFirstWordStage(stage: number): boolean { return [5, 6, 9, 10].includes(stage); }
export function playableStage(param: unknown): PlayableStage | null {
  return typeof param === 'string' && /^(?:[1-9]|1[0-6])$/.test(param) ? Number(param) as PlayableStage : null;
}
export function availableBooks<T extends CatalogBook>(books: readonly T[], language: string): T[] {
  return books.filter(b => b.language === language);
}
export function resolveSelection(books: readonly CatalogBook[], stored: unknown): Selection {
  const value = stored && typeof stored === 'object' ? stored as Partial<Selection> : {};
  const language = languages.find(l => l.id === value.language)?.id ?? 'english';
  const candidates = availableBooks(books, language);
  // Only legacy book-only selections may choose the catalog's default version.
  // An explicit version must never be reinterpreted as another version's content.
  const matches = value.packageKey === undefined ? [] : candidates.filter(b => b.packageKey === value.packageKey && b.id === value.book);
  const selected = value.packageKey === undefined
    ? candidates.find(b => b.id === value.book) ?? candidates[0]
    : matches.length === 1 ? matches[0] : undefined;
  return { language, book: selected?.id ?? null, ...(selected?.packageKey ? { packageKey: selected.packageKey } : {}) };
}
