import { Asset } from 'expo-asset';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import manifest from '../../assets/sample/manifest.json';
import { installPackage, verifyPackage, type PackageIO } from '../core/package';
import { packageKeyOf, type LearningPackage } from '../core/learning-context';

export type BundledPackage = LearningPackage & { modules: Readonly<Record<string, number>> };
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
export const samplePackage: BundledPackage = { manifest, language: 'english', modules };
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
  const key = packageKeyOf(pack);
  if (!installations.has(key)) installations.set(key,
    installPackage(pack.manifest, packageIO(pack), onProgress).finally(() => { installations.delete(key); }));
  return installations.get(key)!;
}
export async function isInstalled(pack: BundledPackage): Promise<boolean> {
  return marker(pack).exists && await verifyPackage(pack.manifest, packageIO(pack));
}
export function audioUri(pack: LearningPackage, phrase: number): string {
  const item = pack.manifest.phrases[phrase];
  if (!item) throw new Error('Unknown phrase.');
  const file = new File(directory(pack), item.file);
  if (!file.exists) throw new Error('Lesson audio is missing.');
  return file.uri;
}
export function removePackage(pack: LearningPackage) {
  if (installations.has(packageKeyOf(pack))) throw new Error('Installation is still running.');
  const dir = directory(pack);
  if (dir.exists) dir.delete();
}
