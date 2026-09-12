import type { PackageManifest } from './package';
import type { Journal } from './journal';
import type { Session } from './session';

export type LearningPackage = {
  language: string;
  manifest: PackageManifest & { id: string; version: number; title: string;
    phrases: (PackageManifest['phrases'][number] & { text: string; translation: string })[] };
};

export function packageKeyOf(pack: LearningPackage): string {
  const { id, version } = pack.manifest;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !Number.isSafeInteger(version) || version < 1) {
    throw Error('Unsupported package identity.');
  }
  // Preserve the installed sample directory and SQLite keys exactly.
  return `${id}-v${version}`;
}

export function resolvePackage<T extends LearningPackage>(packages: readonly T[], key: unknown): T | null {
  if (typeof key !== 'string') return null;
  const matches = packages.filter(pack => packageKeyOf(pack) === key);
  return matches.length === 1 ? matches[0] ?? null : null;
}

/** Binds phrase compatibility and reward identity to the package opened by the learner. */
export class LearningContext {
  readonly packageKey: string;
  constructor(readonly pack: LearningPackage, private journal: Journal) {
    this.packageKey = packageKeyOf(pack);
  }
  load(stage: 1 | 2) {
    return this.journal.load(this.packageKey, stage, this.pack.manifest.phrases.length);
  }
  save(state: Session) {
    if (state.phraseCount !== this.pack.manifest.phrases.length) throw Error('Incompatible package checkpoint.');
    this.journal.save(this.packageKey, state, { book: this.pack.manifest.id, language: this.pack.language });
  }
  completions(stage: 1 | 2) { return this.journal.completions(this.packageKey, stage); }
}
