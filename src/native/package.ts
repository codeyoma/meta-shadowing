import { Asset } from 'expo-asset';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import manifest from '../../assets/sample/manifest.json';
import { installPackage, verifyPackage, type PackageIO } from '../core/package';

export const lesson = manifest;
export const packageKey = `${lesson.id}-v${lesson.version}`;
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
const directory = () => new Directory(Paths.document, 'lesson-packages', packageKey);
const marker = () => new File(directory(), 'ready');
const io: PackageIO = {
  async source(key) {
    const module = modules[key];
    if (module === undefined) throw new Error('Unknown test asset.');
    const asset = await Asset.fromModule(module).downloadAsync();
    if (!asset.localUri) throw new Error('Test asset is unavailable.');
    return new File(asset.localUri).bytes();
  },
  async read(key) { const file = new File(directory(), key); return file.exists ? file.bytes() : null; },
  async write(key, bytes) {
    const file = new File(directory(), key);
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    file.write(bytes);
  },
  async markReady(value) {
    if (!value) { if (marker().exists) marker().delete(); }
    else marker().write('1');
  },
  async hash(bytes) {
    const result = await digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
  },
};
let installation: Promise<void> | null = null;
export function installSample(onProgress: (done: number) => void) {
  if (!installation) installation = installPackage(lesson, io, onProgress).finally(() => { installation = null; });
  return installation;
}
export async function isInstalled(): Promise<boolean> {
  return marker().exists && await verifyPackage(lesson, io);
}
export function audioUri(phrase: number): string {
  const item = lesson.phrases[phrase];
  if (!item) throw new Error('Unknown phrase.');
  const file = new File(directory(), item.file);
  if (!file.exists) throw new Error('Lesson audio is missing.');
  return file.uri;
}
export function removeSample() {
  if (installation) throw new Error('Installation is still running.');
  const dir = directory();
  if (dir.exists) dir.delete();
}
