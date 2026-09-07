export function localStudyDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validStudyDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function studyStreak(days: readonly string[], now = new Date()): number {
  // Calendar days, not 24-hour intervals: DST must not break a consecutive streak.
  const dayMs = 86_400_000;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / dayMs;
  const practiced = new Set(days.filter(validStudyDay).map(day => Date.parse(`${day}T00:00:00.000Z`) / dayMs));
  let cursor = practiced.has(today) ? today : today - 1;
  let streak = 0;
  while (practiced.has(cursor)) { streak++; cursor--; }
  return streak;
}
