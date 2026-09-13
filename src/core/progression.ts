import type { Database } from './journal';
import { levelProgress, MAX_XP } from './levels';
export { levelProgress } from './levels';

export type BookIdentity = { language: string; book: string };
export type DailyReward = { stage: number; awarded: number; limit: number };

export function localDay(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw Error('Invalid completion date.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function previousDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export function dailyLimit(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 16) throw Error('Invalid reward stage.');
  return stage <= 10 ? 2 : 3;
}

/** Reads historical awards and current cycle credit; Journal owns every new write. */
export class Progression {
  constructor(private db: Database, private now: () => Date = () => new Date()) {
    db.exec(`CREATE TABLE IF NOT EXISTS daily_stages (
      language TEXT NOT NULL, book TEXT NOT NULL, day TEXT NOT NULL, stage INTEGER NOT NULL,
      PRIMARY KEY(language,book,day));
      CREATE TABLE IF NOT EXISTS stage_awards (
        language TEXT NOT NULL, book TEXT NOT NULL, run TEXT NOT NULL,
        day TEXT NOT NULL, stage INTEGER NOT NULL, xp INTEGER NOT NULL CHECK(xp IN (0,10)),
        PRIMARY KEY(language,book,run));
      CREATE INDEX IF NOT EXISTS awards_daily ON stage_awards(language,book,day,stage);
      CREATE TABLE IF NOT EXISTS study_days (
        language TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(language,day));`);
  }
  daily(language: string, book: string): DailyReward | null {
    const day = localDay(this.now());
    const chosen = this.db.first<{ stage: number }>('SELECT stage FROM daily_stages WHERE language=? AND book=? AND day=?', language, book, day);
    if (!chosen) return null;
    const awarded = this.db.first<{ count: number }>('SELECT COUNT(*) AS count FROM stage_awards WHERE language=? AND book=? AND day=? AND xp=10', language, book, day)!.count;
    return { stage: chosen.stage, awarded, limit: dailyLimit(chosen.stage) };
  }
  summary(language: string) {
    const day = localDay(this.now());
    const xp = Math.min(MAX_XP, this.db.first<{ total: number }>(`SELECT
      (SELECT TOTAL(xp) FROM stage_awards WHERE language=?) +
      (SELECT TOTAL(credited) FROM cycle_credits WHERE language=?) AS total`, language, language)!.total);
    const last = this.db.first<{ day: string | null }>('SELECT MAX(day) AS day FROM study_days WHERE language=? AND day<=?', language, day)?.day;
    let streak = 0;
    if (last && (last === day || last === previousDay(day))) {
      streak = this.db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM (
        SELECT CAST(julianday(?) - julianday(day) AS INTEGER) - ROW_NUMBER() OVER (ORDER BY day DESC) AS gap
        FROM study_days WHERE language=? AND day<=?) WHERE gap=-1`, last, language, last)!.count;
    }
    return { xp, streak, ...levelProgress(xp) };
  }
}
