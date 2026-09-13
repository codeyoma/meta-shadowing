import delivery from '../../modules/package-delivery';
import type { LearningPackage } from '../core/learning-context';
import { PackageMaterialStorage, packageOperations } from '../core/package-storage';
import { hostedStorage, removeHostedMaterials } from './hosted-package';
import { verifyBundledMaterials } from './package';

const storage = new PackageMaterialStorage(packageOperations, {
  async read(key, busy) {
    if (key === 'hosted-morning-notes-v1') {
      const value = await hostedStorage();
      return { ...value, busy: busy || value.busy };
    }
    const bytes = await delivery.bundledBytes();
    return { bytes, installed: !busy && await verifyBundledMaterials(), busy };
  },
  async remove(key) {
    if (key === 'hosted-morning-notes-v1') return removeHostedMaterials();
    await delivery.removeBundledMaterials();
    return { cacheCleared: true };
  },
});

export const readPackageStorage = (pack: LearningPackage): Promise<{ bytes: number; installed: boolean; busy: boolean }> => storage.read(pack);
export const removePackageMaterials = (pack: LearningPackage): Promise<{ cacheCleared: boolean }> => storage.remove(pack);
