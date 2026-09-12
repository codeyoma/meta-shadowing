export type CatalogBook = { id: string; language: string };
export type Selection = { language: string; book: string | null };
export const languages = [
  { id: 'english', name: '영어', flag: '🇬🇧', displayCode: 'EN' },
  { id: 'japanese', name: '일본어', flag: '🇯🇵', displayCode: 'JP' },
  { id: 'chinese', name: '중국어', flag: '🇨🇳', displayCode: 'CN' },
  { id: 'german', name: '독일어', flag: '🇩🇪', displayCode: 'DE' },
  { id: 'spanish', name: '스페인어', flag: '🇪🇸', displayCode: 'ES' },
  { id: 'french', name: '프랑스어', flag: '🇫🇷', displayCode: 'FR' },
] as const;
export function playableStage(param: unknown): 1 | 2 | null {
  return param === '1' ? 1 : param === '2' ? 2 : null;
}
export function availableBooks<T extends CatalogBook>(books: readonly T[], language: string): T[] {
  return books.filter(b => b.language === language);
}
export function resolveSelection(books: readonly CatalogBook[], stored: unknown): Selection {
  const value = stored && typeof stored === 'object' ? stored as Partial<Selection> : {};
  const language = languages.find(l => l.id === value.language)?.id ?? 'english';
  const candidates = availableBooks(books, language);
  return { language, book: candidates.find(b => b.id === value.book)?.id ?? candidates[0]?.id ?? null };
}
