import { samplePackage } from './package';
import { hostedSample } from './hosted-package';
import { freeDuoPackage } from './free-duo';
import { packageKeyOf, resolvePackage } from '@/core/learning-context';

export { languages } from '@/core/catalog';
export const books = [samplePackage, hostedSample, ...(freeDuoPackage ? [freeDuoPackage] : [])].map(pack => ({ ...pack,
  id: pack.manifest.id, title: pack.manifest.title, packageKey: packageKeyOf(pack),
  sentences: pack.manifest.phrases.length, chapters: null as number | null,
  // Samples and explicitly enabled internal test content; never a StoreKit entitlement.
  owned: true as boolean }));
export function selectedPackage(key: unknown) { return resolvePackage(books, key); }
