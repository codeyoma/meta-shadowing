import type { Database } from './journal';

export type BookIdentity = { language: string; book: string };
type Completion = BookIdentity & { stage: number; run: string };
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
export function levelProgress(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw Error('Invalid XP.');
  let level = 1, current = xp;
  let required = 100;
  while (current >= required) {
    current -= required;
    level++;
    required = Math.round(10 * 1.08 ** (level - 1)) * 10;
  }
  return { level, current, required };
}
export function dailyLimit(stage: number) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 16) throw Error('Invalid reward stage.');
  return stage <= 10 ? 2 : 3;
}

/** Local completion ledger. SAVEPOINT also participates in Journal's outer transaction. */
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
  record(input: Completion): number {
    const { language, book, stage, run } = input;
    const limit = dailyLimit(stage);
    if (![language, book, run].every(s => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= 200)) throw Error('Invalid reward identity.');
    const day = localDay(this.now());
    this.db.exec('SAVEPOINT stage_reward');
    try {
      const existing = this.db.first<{ stage: number }>('SELECT stage FROM stage_awards WHERE language=? AND book=? AND run=?', language, book, run);
      if (existing) {
        if (existing.stage !== stage) throw Error('Conflicting completed run.');
        this.db.exec('RELEASE stage_reward'); return 0;
      }
      this.db.run('INSERT OR IGNORE INTO daily_stages(language,book,day,stage) VALUES (?,?,?,?)', language, book, day, stage);
      const chosen = this.db.first<{ stage: number }>('SELECT stage FROM daily_stages WHERE language=? AND book=? AND day=?', language, book, day)!;
      const count = this.db.first<{ count: number }>('SELECT COUNT(*) AS count FROM stage_awards WHERE language=? AND book=? AND day=? AND xp=10', language, book, day)!.count;
      const xp = chosen.stage === stage && count < limit ? 10 : 0;
      this.db.run('INSERT INTO stage_awards(language,book,run,day,stage,xp) VALUES (?,?,?,?,?,?)', language, book, run, day, stage, xp);
      this.db.run('INSERT OR IGNORE INTO study_days(language,day) VALUES (?,?)', language, day);
      this.db.exec('RELEASE stage_reward');
      return xp;
    } catch (error) {
      this.db.exec('ROLLBACK TO stage_reward'); this.db.exec('RELEASE stage_reward'); throw error;
    }
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
    const xp = this.db.first<{ total: number }>('SELECT COALESCE(SUM(xp),0) AS total FROM stage_awards WHERE language=?', language)!.total;
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
