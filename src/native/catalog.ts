import { samplePackage } from './package';
import { hostedSample } from './hosted-package';
import { freeDuoPackage } from './free-duo';
import { paidDuoPackage, isPaidDuo, paidAccess } from './paid-package';
import { packageKeyOf, resolvePackage } from '@/core/learning-context';
import { localVideoPackage } from './video-package';

export { languages } from '@/core/catalog';
export const books = [samplePackage, hostedSample, ...(localVideoPackage ? [localVideoPackage] : []), ...(freeDuoPackage ? [freeDuoPackage] : []), ...(paidDuoPackage ? [paidDuoPackage] : [])].map(pack => ({ ...pack,
  id: pack.manifest.id, title: pack.manifest.title, packageKey: packageKeyOf(pack),
  sentences: pack.manifest.phrases.length, chapters: null as number | null,
  // Samples and explicitly enabled internal test content; never a StoreKit entitlement.
  get owned(): boolean { return !isPaidDuo(pack) || paidAccess.getSnapshot().allowed; } }));
export function selectedPackage(key: unknown) { return resolvePackage(books, key); }
