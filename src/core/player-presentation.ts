import { canChooseNext, canShowThirdCycleChoices, type Session } from './session';
import { isRevealStage } from './catalog';

export function phraseCounterText(current: number, total: number) {
  const digits = '8'.repeat(String(total).length);
  return { label: `${current}/${total}`, measure: `${digits}/${digits}` };
}

export type MainPlayerAction = 'resume' | 'confirm' | 'next' | 'leave' | 'recover' | 'wait';
export function canPulseCycle(state: Session): boolean {
  return state.phase === 'speaking' && state.confirmed < state.planned;
}
export function canOfferRepeat(state: Session, error: 'save' | 'audio' | null): boolean {
  return !error && !isRevealStage(state.stage) && state.planned === 3 && (state.phase === 'decision' || canShowThirdCycleChoices(state));
}
export function completedConnections(state: Session): number {
  return Math.min(state.confirmed, state.planned - 1);
}
export function mainPlayerAction(state: Session, error: 'save' | 'audio' | null): MainPlayerAction {
  if (error) return 'recover';
  if (state.phase === 'complete') return 'leave';
  if (canChooseNext(state)) return 'next';
  if (state.phase === 'speaking') return 'confirm';
  return state.running ? 'wait' : 'resume';
}
export function cycleTimeline(state: Session, duration: number) {
  const active = state.confirmed < state.planned ? state.confirmed : -1;
  const progress = state.phase === 'speaking' ? 1
    : state.phase === 'listening' && Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(1, state.audioSeconds / duration)) : 0;
  return { count: state.planned, confirmed: state.confirmed, active, progress };
}
