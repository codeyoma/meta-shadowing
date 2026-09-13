import { defaultCrazyWpm, type Settings } from './settings';

type Speeds = NonNullable<Settings['crazyWpm']>;
const snap = (value: number, min: number, max: number, step: number) =>
  Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step));

/** Derive current editor values without rewriting legacy backup payloads on read. */
export function normalizeSpeakingSpeeds(saved: Speeds = defaultCrazyWpm): Speeds {
  const result = [...saved] as Speeds;
  result[0] = snap(saved[0], 100, 200, 25);
  for (let i = 1; i < 4; i++) result[i] = result[i - 1]! + snap(saved[i]! - saved[i - 1]!, 50, 150, 50);
  return result;
}

export function speakingSpeedRange(saved: Speeds, index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw Error('Invalid speaking stage.');
  if (index === 0) return { min: 100, max: 200, step: 25 };
  const previous = normalizeSpeakingSpeeds(saved)[index - 1]!;
  return { min: previous + 50, max: previous + 150, step: 50 };
}

export function changeSpeakingSpeed(saved: Speeds, index: number, value: number): Speeds {
  if (!Number.isFinite(value)) throw Error('Invalid speaking speed.');
  const range = speakingSpeedRange(saved, index), result = normalizeSpeakingSpeeds(saved);
  const difference = snap(value, range.min, range.max, range.step) - result[index]!;
  // Subsequent stages retain their selected +50/+100/+150 spacing.
  for (let i = index; i < 4; i++) result[i] = result[i]! + difference;
  return result;
}
