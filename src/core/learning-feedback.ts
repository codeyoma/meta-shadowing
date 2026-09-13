import type { Session } from './session';

export type LearningFeedback = 'cycle' | 'next' | 'complete';

export function createLearningFeedback(initial: Session) {
  let previous = { ...initial };
  return (saved: Session): LearningFeedback | null => {
    const before = previous;
    previous = { ...saved };
    if (saved.runId !== before.runId || before.phase === 'complete') return null;
    if (saved.phase === 'complete') return 'complete';
    if (saved.phrase > before.phrase) return 'next';
    if (saved.confirmed > before.confirmed) return 'cycle';
    return null;
  };
}
