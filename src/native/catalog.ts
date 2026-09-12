import { samplePackage } from './package';
import { packageKeyOf, resolvePackage } from '@/core/learning-context';

export { languages } from '@/core/catalog';
export const books = [samplePackage].map(pack => ({ ...pack,
  id: pack.manifest.id, title: pack.manifest.title, packageKey: packageKeyOf(pack),
  sentences: pack.manifest.phrases.length, chapters: null as number | null,
  // Only the controlled bundled sample is available; this is not a purchase entitlement.
  owned: true as boolean }));
export function selectedPackage(key: unknown) { return resolvePackage(books, key); }
