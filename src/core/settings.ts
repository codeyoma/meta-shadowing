export type Settings = { mode: 'manual'; rate: number };
export function isPlaybackRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 3;
}
export function decodeSettings(json: string | null): Settings {
  if (json === null) return { mode: 'manual', rate: 1 };
  const value = JSON.parse(json);
  if (!value || !['manual', 'auto'].includes(value.mode) || !isPlaybackRate(value.rate)) throw Error('Invalid settings.');
  return { mode: 'manual', rate: value.rate };
}
