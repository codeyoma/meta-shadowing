import { lesson, packageKey } from './package';

export { languages } from '@/core/catalog';
export const books = [{ id: lesson.id, language: 'english', title: lesson.title, packageKey,
  sentences: lesson.phrases.length, chapters: null as number | null, owned: true as boolean }] as const;
export const sampleIdentity = { book: lesson.id, language: 'english' };
