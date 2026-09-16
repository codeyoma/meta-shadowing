import type { Session } from './session';

export type HapticPulse = { time: number; intensity: number; sharpness: number };
const medium = 0.45, strong = 0.7, weak = 0.25;
const rhythm = (levels: number[]): HapticPulse[] => levels.map((intensity, index) => ({
  time: index * 0.08, intensity, sharpness: 0.5,
}));

/** Observe only successfully saved states. Playback, restore and duplicate saves are silent. */
export function createCycleHaptics(initial: Session) {
  let previous = { ...initial };
  return (saved: Session): HapticPulse[] | null => {
    const before = previous;
    previous = { ...saved };
    if (saved.runId !== before.runId || saved.stage !== before.stage || before.phase === 'complete') return null;
    if (saved.phrase === before.phrase && before.planned === 3 && saved.planned === 5) return rhythm([medium]);
    const advanced = saved.phrase > before.phrase;
    const cycle = advanced ? before.confirmed + 1 : saved.confirmed;
    if (advanced ? before.confirmed >= before.planned : saved.confirmed <= before.confirmed) return null;
    if (cycle === 1 || cycle === 4) return rhythm([medium, strong]);
    if (cycle === 2) return rhythm([medium, medium, strong]);
    if (cycle === 3 || cycle === 5) return rhythm([medium, medium, strong, weak]);
    return null;
  };
}
