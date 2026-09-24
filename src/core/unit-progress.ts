import type { Session } from './session';

export type UnitProgress = { confirmed: number; planned: number };
export function groupedSourceProgress(sources: readonly UnitProgress[], size: number): UnitProgress[] {
  const groups: UnitProgress[] = [];
  for (let start = 0; start < sources.length; start += size) {
    const members = sources.slice(start, start + size);
    const planned = Math.max(...members.map(p => p.planned));
    groups.push({ planned, confirmed: planned - Math.max(...members.map(p => p.planned - p.confirmed)) });
  }
  return groups;
}
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
