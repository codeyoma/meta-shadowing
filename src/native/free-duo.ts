import delivery from '../../modules/package-delivery';
import { readFreeTestPackage } from '@/core/free-test-package';
import type { LearningPackage } from '@/core/learning-context';

// No content is imported into Metro. Normal builds receive no native manifest.
export const freeDuoPackage = readFreeTestPackage(delivery.freeDuoManifest);
export const isFreeDuo = (pack: LearningPackage) => freeDuoPackage !== null
  && pack.language === freeDuoPackage.language && pack.manifest === freeDuoPackage.manifest;
export const freeDuoActions = {
  status: () => delivery.freeDuoStatus(),
  start: () => delivery.freeDuoStart(),
  cancel: () => delivery.freeDuoCancel(),
  storage: () => delivery.freeDuoStorage(),
  remove: () => delivery.freeDuoRemove(),
};
