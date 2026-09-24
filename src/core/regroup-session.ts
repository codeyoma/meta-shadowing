import { restoreSession, type Session } from './session';
import { isGroupSize, type GroupSize } from './learning-units';
import { groupedSourceProgress, unitProgress } from './unit-progress';

/** A new immutable plan retains per-source work; old reward receipts stay intact. */
export function regroupSession(state: Session, size: GroupSize, runId: string): Session {
  if (state.version !== 2 || state.running || state.phase === 'complete' || !isGroupSize(size)) throw Error('Pause an unfinished grouped run first.');
  if (state.groupSize === size) return state;
  if (!runId || runId === state.runId) throw Error('Regrouping requires a new plan identity.');
  const saved = restoreSession(JSON.stringify(state), state.sourcePhraseCount, state.stage);
  const units = unitProgress(saved);
  const sourceProgress = (saved.sourceProgress ?? Array.from({ length: state.sourcePhraseCount }, (_, i) => ({ ...units[Math.floor(i / state.groupSize)]! })))
    .map(p => p.confirmed === p.planned ? { ...p, closed: true as const } : p);
  const progress = groupedSourceProgress(sourceProgress, size);
  let phrase = Math.floor(state.phrase * state.groupSize / size);
  if (progress[phrase]!.confirmed === progress[phrase]!.planned) {
    const unfinished = progress.findIndex((p, i) => i >= phrase && p.confirmed < p.planned);
    phrase = unfinished < 0 ? progress.findIndex(p => p.confirmed < p.planned) : unfinished;
  }
  // An already confirmed final decision is left for the user's explicit Next.
  if (phrase < 0) phrase = progress.length - 1;
  const current = progress[phrase]!;
  const json = JSON.stringify({ ...saved, runId, lineage: saved.lineage ?? saved.runId, groupSize: size, sourceProgress,
    unitProgress: progress, phraseCount: progress.length, phrase, ...current,
    phase: current.confirmed === current.planned ? 'decision' : 'ready', audioSeconds: 0, remainingMs: 0 });
  if (json.length > 4 * 1024 * 1024) throw Error('Regrouped checkpoint exceeds the backup limit.');
  return restoreSession(json, state.sourcePhraseCount, state.stage);
}
