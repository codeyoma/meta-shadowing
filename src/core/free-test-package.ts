import type { LearningPackage } from './learning-context';

export type FreeTestPackage = LearningPackage & { delivery: 'appleHosted' };
/** Input comes exclusively from a native build/environment gate, never user preferences. */
export function readFreeTestPackage(json: unknown): FreeTestPackage | null {
  if (typeof json !== 'string') return null;
  try {
    const m = JSON.parse(json);
    if (m.id !== 'duo-33-free-test' || ![1, 2].includes(m.version) || typeof m.title !== 'string'
      || !Array.isArray(m.phrases) || !m.phrases.length || m.phrases.length > 1000
      || new Set(m.phrases.map((p: {file: string}) => p.file)).size !== m.phrases.length
      || m.phrases.some((p: {file: string;bytes: number;sha256: string;text: string;translation: string}) =>
        !/^audio\/[a-z0-9-]+\.m4a$/.test(p.file) || !Number.isSafeInteger(p.bytes) || p.bytes <= 0
        || p.bytes > 50_000_000 || !/^[a-f0-9]{64}$/.test(p.sha256)
        || typeof p.text !== 'string' || !p.text || typeof p.translation !== 'string' || !p.translation)) return null;
    return { language: 'english', delivery: 'appleHosted', manifest: m };
  } catch { return null; }
}
