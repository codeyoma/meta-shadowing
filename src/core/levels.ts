export const MAX_XP = 2_147_483_647;
// Built once from the unrounded curve; all 998 boundaries are verified against
// exact 10053/10000 arithmetic in levels.test.ts. Runtime uses only numbers.
const thresholds = Object.freeze(Array.from({ length: 998 }, (_, index) => Math.round(10 * 1.0053 ** index) * 10)
  .reduce<number[]>((values, increment) => { values.push((values.at(-1) ?? 0) + increment); return values; }, []));

export function levelProgress(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw Error('Invalid XP.');
  xp = Math.min(MAX_XP, xp);
  let low = 0, high = thresholds.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (xp >= thresholds[mid]!) low = mid + 1; else high = mid;
  }
  if (low === thresholds.length) return { level: 999, current: 1, required: 1, maxLevel: true };
  const start = thresholds[low - 1] ?? 0;
  return { level: low + 1, current: xp - start, required: thresholds[low]! - start, maxLevel: false };
}
