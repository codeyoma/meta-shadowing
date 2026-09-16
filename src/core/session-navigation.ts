import { restoreSession, type Session } from './session';
import { selectUnit } from './unit-progress';
export { unitProgress, completedUnitCount, selectUnit, type UnitProgress } from './unit-progress';
export function jumpToSourcePhrase(state: Session, sourceIndex: number): Session {
  const count = state.version === 2 ? state.sourcePhraseCount : state.phraseCount;
  if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= count) throw Error('Invalid source phrase.');
  const saved = restoreSession(JSON.stringify(state), count, state.stage);
  if (saved.phase === 'complete') return saved;
  return selectUnit(saved, Math.floor(sourceIndex / (saved.version === 2 ? saved.groupSize : 1)));
}
