import { Asset } from 'expo-asset';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import manifest from '../../assets/sample/manifest.json';
import { installPackage, verifyPackage, type PackageIO } from '../core/package';
import { packageKeyOf, isVideoPackage, type AudioLearningPackage, type LearningPackage } from '../core/learning-context';
import { videoPackageActions } from './video-package';
import { hostedSample, hostedStatus } from './hosted-package';
import delivery from '../../modules/package-delivery';
import { knownMaterialKey, packageOperations } from '../core/package-storage';
import { isFreeDuo, freeDuoActions } from './free-duo';
import { isPaidDuo, paidDuoActions, authorizePackage, mayUsePackage } from './paid-package';

export type BundledPackage = AudioLearningPackage & { delivery: 'bundled'; modules: Readonly<Record<string, number>> };
const modules: Record<string, number> = {
  'audio/phrase-01.m4a': require('../../assets/sample/audio/phrase-01.m4a'),
  'audio/phrase-02.m4a': require('../../assets/sample/audio/phrase-02.m4a'),
  'audio/phrase-03.m4a': require('../../assets/sample/audio/phrase-03.m4a'),
  'audio/phrase-04.m4a': require('../../assets/sample/audio/phrase-04.m4a'),
  'audio/phrase-05.m4a': require('../../assets/sample/audio/phrase-05.m4a'),
  'audio/phrase-06.m4a': require('../../assets/sample/audio/phrase-06.m4a'),
  'audio/phrase-07.m4a': require('../../assets/sample/audio/phrase-07.m4a'),
  'audio/phrase-08.m4a': require('../../assets/sample/audio/phrase-08.m4a'),
  'audio/phrase-09.m4a': require('../../assets/sample/audio/phrase-09.m4a'),
  'audio/phrase-10.m4a': require('../../assets/sample/audio/phrase-10.m4a'),
  'audio/phrase-11.m4a': require('../../assets/sample/audio/phrase-11.m4a'),
  'audio/phrase-12.m4a': require('../../assets/sample/audio/phrase-12.m4a'),
};
export const samplePackage: BundledPackage = { manifest, language: 'english', modules, delivery: 'bundled' };
const directory = (pack: LearningPackage) => new Directory(Paths.document, 'lesson-packages', packageKeyOf(pack));
const marker = (pack: LearningPackage) => new File(directory(pack), 'ready');
function packageIO(pack: BundledPackage): PackageIO { return {
  async source(key) {
    const module = pack.modules[key];
    if (module === undefined) throw new Error('Unknown test asset.');
    const asset = await Asset.fromModule(module).downloadAsync();
    if (!asset.localUri) throw new Error('Test asset is unavailable.');
    return new File(asset.localUri).bytes();
  },
  async read(key) { const file = new File(directory(pack), key); return file.exists ? file.bytes() : null; },
  async write(key, bytes) {
    const file = new File(directory(pack), key);
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    file.write(bytes);
  },
  async markReady(value) {
    if (!value) { if (marker(pack).exists) marker(pack).delete(); }
    else marker(pack).write('1');
  },
  async hash(bytes) {
    const result = await digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
  },
}; }
const installations = new Map<string, Promise<void>>();
export function installBundledPackage(pack: BundledPackage, onProgress: (done: number) => void) {
  const key = knownMaterialKey(pack);
  if (key !== 'morning-notes-v1') throw Error('Unsupported bundled material.');
  if (!installations.has(key)) installations.set(key,
    packageOperations.run(key, async () => {
      await delivery.bundledBytes(); // Native symlink/containment preflight before any JS file mutation.
      await installPackage(samplePackage.manifest, packageIO(samplePackage), onProgress);
    }).finally(() => { installations.delete(key); }));
  return installations.get(key)!;
}
export async function isInstalled(pack: LearningPackage): Promise<boolean> {
  if (isVideoPackage(pack)) return (await videoPackageActions.status(pack)).installed;
  if (isPaidDuo(pack)) return await authorizePackage(pack) && (await paidDuoActions.status()).phase === 'ready' && mayUsePackage(pack);
  if (isFreeDuo(pack)) return (await freeDuoActions.status()).phase === 'ready';
  const key = knownMaterialKey(pack);
  if (key === packageKeyOf(hostedSample)) return (await hostedStatus()).phase === 'ready';
  if (packageOperations.busy(key)) return false;
  return packageOperations.run(key, async () => {
    await delivery.bundledBytes();
    return verifyBundledMaterials();
  });
}
// Caller must hold packageOperations; exported only for the storage adapter.
export async function verifyBundledMaterials(): Promise<boolean> {
  return marker(samplePackage).exists && await verifyPackage(samplePackage.manifest, packageIO(samplePackage));
}
export function audioUri(pack: LearningPackage, phrase: number): string {
  if (isVideoPackage(pack)) throw new Error('Video requires its own playback adapter.');
  if (!mayUsePackage(pack)) throw new Error('package-delivery-unauthorized');
  const item = pack.manifest.phrases[phrase];
  if (!item) throw new Error('Unknown phrase.');
  const file = new File(directory(pack), item.file);
  if (!file.exists) throw new Error('Lesson audio is missing.');
  return file.uri;
}
