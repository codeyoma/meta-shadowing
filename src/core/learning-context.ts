import type { PackageManifest } from './package';
import type { Journal } from './journal';
import { restoreSession, type Session } from './session';
import type { PlayableStage } from './catalog';
import { learningUnits } from './learning-units';

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
  load(stage: PlayableStage) {
    return this.journal.load(this.packageKey, stage, this.pack.manifest.phrases.length);
  }
  save(state: Session) {
    this.validate(state);
    return this.journal.save(this.packageKey, state, { book: this.pack.manifest.id, language: this.pack.language });
  }
  createWriter(initial: Session) {
    this.validate(initial);
    const write = this.journal.createWriter(this.packageKey, initial, { book: this.pack.manifest.id, language: this.pack.language });
    return (state: Session) => { this.validate(state); return write(state); };
  }
  latestStage() { return this.journal.latestStage(this.packageKey); }
  units(state: Session) {
    const saved = this.validate(state);
    return learningUnits(this.pack.manifest.phrases, saved.stage, saved.version === 2 ? saved.groupSize : 2);
  }
  private validate(state: Session) {
    try {
      return restoreSession(JSON.stringify(state), this.pack.manifest.phrases.length, state.stage);
    } catch { throw Error('Incompatible package checkpoint.'); }
  }
  completions(stage: PlayableStage) { return this.journal.completions(this.packageKey, stage); }
}
