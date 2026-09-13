import { samplePackage } from './package';
import { hostedSample } from './hosted-package';
import { packageKeyOf, resolvePackage } from '@/core/learning-context';

export { languages } from '@/core/catalog';
export const books = [samplePackage, hostedSample].map(pack => ({ ...pack,
  id: pack.manifest.id, title: pack.manifest.title, packageKey: packageKeyOf(pack),
  sentences: pack.manifest.phrases.length, chapters: null as number | null,
  // Controlled samples only; this is not a purchase entitlement.
  owned: true as boolean }));
export function selectedPackage(key: unknown) { return resolvePackage(books, key); }
