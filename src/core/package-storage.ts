import manifest from '../../assets/sample/manifest.json';
import { packageKeyOf, type LearningPackage } from './learning-context';

export type MaterialKey = 'morning-notes-v1' | 'hosted-morning-notes-v1';
export type PackageStorageStatus = { bytes: number; installed: boolean; busy: boolean };
export type PackageRemoval = { cacheCleared: boolean };

/** Resolve an immutable catalog identity, never a user-provided path/descriptor. */
export function knownMaterialKey(pack: LearningPackage): MaterialKey {
  const key = packageKeyOf(pack);
  const expected = key === 'morning-notes-v1' ? manifest
    : key === 'hosted-morning-notes-v1'
      ? { ...manifest, id: 'hosted-morning-notes', title: 'Morning Notes · Apple-hosted' } : null;
  if (!expected || pack.language !== 'english' || JSON.stringify(pack.manifest) !== JSON.stringify(expected)) {
    throw Error('Unsupported lesson material.');
  }
  return key as MaterialKey;
}

/** One JS operation boundary shared by bundled install, verification and removal. */
export class PackageOperations {
  private readonly active = new Set<string>();
  busy(key: string) { return this.active.has(key); }
  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.busy(key)) throw Error('A package operation is still running.');
    this.active.add(key);
    try { return await operation(); }
    finally { this.active.delete(key); }
  }
}

type MaterialPorts = {
  read(key: MaterialKey, busy: boolean): Promise<PackageStorageStatus>;
  remove(key: MaterialKey): Promise<PackageRemoval>;
};

export class PackageMaterialStorage {
  constructor(private readonly operations: PackageOperations, private readonly ports: MaterialPorts) {}
  async read(pack: LearningPackage): Promise<PackageStorageStatus> {
    const key = knownMaterialKey(pack);
    // An active install may be measured, but never verified concurrently.
    if (this.operations.busy(key)) return this.ports.read(key, true);
    return this.operations.run(key, () => this.ports.read(key, false));
  }
  async remove(pack: LearningPackage): Promise<PackageRemoval> {
    const key = knownMaterialKey(pack);
    return this.operations.run(key, () => this.ports.remove(key));
  }
}

export const packageOperations = new PackageOperations();
