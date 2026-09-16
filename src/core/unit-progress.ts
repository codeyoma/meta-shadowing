import type { Session } from './session';

export type UnitProgress = { confirmed: number; planned: number };
export function unitProgress(state: Session): UnitProgress[] {
  return Array.from({ length: state.phraseCount }, (_, index) => index === state.phrase
    ? { confirmed: state.confirmed, planned: state.planned }
    : state.unitProgress?.[index] ?? { confirmed: index < state.phrase ? 3 : 0, planned: 3 });
}
export function completedUnitCount(state: Session): number {
  return unitProgress(state).filter(unit => unit.confirmed === unit.planned).length;
}
export function selectUnit(state: Session, phrase: number): Session {
  const progress = unitProgress(state);
  const unit = progress[phrase]!;
  return { ...state, unitProgress: progress, phrase, ...unit,
    phase: unit.confirmed === unit.planned ? 'decision' : 'ready',
    running: false, audioSeconds: 0, remainingMs: 0 };
}
