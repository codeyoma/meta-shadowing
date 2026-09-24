import learningAudio from '../../modules/learning-audio';
import { readVideoPackage } from '@/core/video-package';
import { packageOperations } from '@/core/package-storage';
import { packageKeyOf, type LearningPackage } from '@/core/learning-context';

// Native Debug resources only. Private text/media never enter the JS bundle.
let invalid = learningAudio?.localVideoManifestInvalid ?? false;
export const localVideoPackage = (() => {
  try { return readVideoPackage(learningAudio?.localVideoManifest ?? null); }
  catch { invalid = true; return null; }
})();
export const localVideoPackageInvalid = invalid;
function key(pack: LearningPackage) {
  if (!localVideoPackage || pack.manifest !== localVideoPackage.manifest) throw Error('Video package unavailable.');
  return packageKeyOf(pack);
}
let reading: Promise<{ installed: boolean; busy: boolean; bytes: number }> | null = null;
export const videoPackageActions = {
  async status(pack: LearningPackage) {
    const id = key(pack);
    if (reading) return reading;
    if (packageOperations.busy(id)) return { installed: false, busy: true, bytes: 0 };
    reading = packageOperations.run(id, async () => ({ ...await learningAudio!.videoPackageStatus(), busy: false }))
      .finally(() => { reading = null; });
    return reading;
  },
  install(pack: LearningPackage) { return packageOperations.run(key(pack), () => learningAudio!.installVideoPackage()); },
  remove(pack: LearningPackage) {
    return packageOperations.run(key(pack), async () => { await learningAudio!.removeVideoPackage(); return { cacheCleared: true }; });
  },
};
