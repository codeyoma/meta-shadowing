import delivery from '../../modules/package-delivery';
import manifest from '../../assets/sample/manifest.json';
import specification from '../../assets/sample/delivery.json';
import type { LearningPackage } from '@/core/learning-context';

// Same controlled text/audio, separate immutable learning identity; no bundled audio fallback.
export const hostedSample: LearningPackage & { delivery: 'appleHosted' } = {
  delivery: 'appleHosted',
  language: 'english',
  manifest: { ...manifest, id: 'hosted-morning-notes', title: 'Morning Notes · Apple-hosted' },
};
const descriptor = JSON.stringify({ key: specification.key, files: [specification.metadata,
  ...manifest.phrases.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 }))] });
export const hostedStatus = () => delivery.status(descriptor);
export const downloadHostedSample = () => delivery.start(descriptor);
export const cancelHostedSample = () => delivery.cancel();
export const hostedStorage = () => delivery.storage(descriptor);
export const removeHostedMaterials = () => delivery.removeMaterials(descriptor);
