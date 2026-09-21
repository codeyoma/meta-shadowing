import type { Session } from './session';
import { canOfferRepeat, mainPlayerAction } from './player-presentation';

export type LessonRemoteEvent = { owner: string; revision: string; action?: string };
type ActionGate = { owner: string; revision: string; actionable: boolean; repeatable: boolean };

/** Consume either action synchronously, before an async save or React render. */
export function takeLessonRemoteAction(gate: ActionGate, event: LessonRemoteEvent): 'main' | 'repeat' | null {
  if (event.owner !== gate.owner || event.revision !== gate.revision) return null;
  const action = event.action ?? 'main'; // Compatibility with existing native builds.
  if (action !== 'main' && action !== 'repeat') return null;
  if (action === 'main' ? !gate.actionable : !gate.repeatable) return null;
  gate.actionable = false;
  gate.repeatable = false;
  return action;
}

export function lessonRemoteSnapshot(state: Session | null, error: 'audio' | 'save' | null, ready: boolean) {
  const action = state ? mainPlayerAction(state, error) : 'wait';
  return {
    revision: JSON.stringify([state?.runId, state?.phrase, state?.confirmed, state?.planned, state?.phase, state?.running, error, ready]),
    actionable: ready && !error && ['resume', 'confirm', 'next'].includes(action),
    repeatable: ready && !!state && action === 'next' && canOfferRepeat(state, error),
    playing: !!state?.running && state.phase === 'listening',
  };
}
