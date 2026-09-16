import type { Database } from './journal';
import { languages } from './catalog';
import { transition, type Session } from './session';
import type { BookIdentity } from './progression';
import { MAX_XP } from './levels';

export type CycleCredit = {
  package: string; stage: number; run: string; language: string; book: string;
  phrase_count: number; phrase: number; confirmed: number; credited: number; day: string;
};
export function validCycleIdentity(key: string, identity: BookIdentity): boolean {
  const match = /^(.*)-v([1-9][0-9]*)$/.exec(key);
  return !!match && match[1] === identity.book && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.book)
    && key.length <= 200 && Number.isSafeInteger(Number(match[2]))
    && languages.some(language => language.id === identity.language);
}
export function createCycleTable(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS cycle_credits (
    package TEXT NOT NULL, stage INTEGER NOT NULL, run TEXT NOT NULL,
    language TEXT NOT NULL, book TEXT NOT NULL, phrase_count INTEGER NOT NULL,
    phrase INTEGER NOT NULL, confirmed INTEGER NOT NULL, credited INTEGER NOT NULL,
    day TEXT NOT NULL, PRIMARY KEY(package,stage,run));`);
}
// Journal supplies a canonical next checkpoint; historical predecessors may
// contain unrelated settings arrays, whose object identity is not learning proof.
const same = (a: Session, b: Session) => (Object.keys(b) as (keyof Session)[]).every(key => a[key] === b[key]);
const position = (a: { phrase: number; confirmed: number }, b: { phrase: number; confirmed: number }) =>
  a.phrase - b.phrase || a.confirmed - b.confirmed;

/** Called only inside Journal's transaction, before replacing its predecessor. */
export function recordCycles(db: Database, key: string, next: Session, prior: Session | null,
  identity: BookIdentity | undefined, completed: boolean, completionDay: string) {
  const mayCredit = !!identity;
  const row = db.first<CycleCredit>('SELECT * FROM cycle_credits WHERE package=? AND stage=? AND run=?', key, next.stage, next.runId);
  if (row && (!identity || row.book !== identity.book || row.language !== identity.language || row.phrase_count !== next.phraseCount)) {
    if (identity || row.phrase_count !== next.phraseCount) throw Error('Conflicting cycle identity.');
    identity = { book: row.book, language: row.language };
  }
  if (!identity) return 0;
  if (!validCycleIdentity(key, identity)) throw Error('Invalid cycle identity.');
  const bound = db.first<{ language: string; book: string }>('SELECT language,book FROM cycle_credits WHERE package=? LIMIT 1', key);
  if (bound && (bound.language !== identity.language || bound.book !== identity.book)) throw Error('Conflicting package identity.');
  if (prior?.runId === next.runId && prior.phraseCount !== next.phraseCount) throw Error('Conflicting run size.');
  const predecessor = prior?.runId === next.runId ? prior : null;
  if (row && (completed || row.day) && next.phase === 'complete' && position(next, row) !== 0) throw Error('Conflicting completed cycle frontier.');
  if ((row && (completed || row.day || !predecessor) && position(next, row) > 0)
    || (completed && predecessor && position(next, predecessor) > 0)) throw Error('Conflicting cycle frontier.');
  const baseline = predecessor ?? next;
  // A completion row alone cannot reconstruct a displaced legacy frontier.
  if (completed && !row && baseline.phase !== 'complete') throw Error('Unproven completed cycle frontier.');
  let phrase = row?.phrase ?? baseline.phrase, confirmed = row?.confirmed ?? baseline.confirmed;
  let credited = row?.credited ?? 0;
  // Completed histories and rewinds are immutable credit frontiers.
  if (!completed && !row?.day && predecessor && position(next, { phrase, confirmed }) > 0) {
    const accepted = (['confirm', 'repeat', 'next'] as const).some(type => {
      const result = transition(predecessor, { type });
      return result !== predecessor && same(result, next);
    });
    if (mayCredit && accepted && predecessor.phase === 'speaking' && position(predecessor, { phrase, confirmed }) === 0) credited = Math.min(MAX_XP, credited + 1);
    // Unsupported snapshot jumps baseline their observed position, never catch up XP.
    phrase = next.phrase; confirmed = next.confirmed;
  }
  const day = row?.day || (!completed && next.phase === 'complete' ? completionDay : '');
  db.run(`INSERT INTO cycle_credits(package,stage,run,language,book,phrase_count,phrase,confirmed,credited,day)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(package,stage,run) DO UPDATE SET
    phrase=excluded.phrase,confirmed=excluded.confirmed,credited=excluded.credited,day=excluded.day`,
  key, next.stage, next.runId, identity.language, identity.book, next.phraseCount, phrase, confirmed, credited, day);
  if (day) db.run('INSERT OR IGNORE INTO study_days(language,day) VALUES (?,?)', identity.language, day);
  const earned = credited - (row?.credited ?? 0);
  if (!earned) return 0;
  const total = db.first<{ total: number }>(`SELECT
    (SELECT TOTAL(xp) FROM stage_awards WHERE language=?) +
    (SELECT TOTAL(credited) FROM cycle_credits WHERE language=?) AS total`, identity.language, identity.language)!.total;
  // The receipt describes the visible total's increase, including its integer cap.
  return Math.max(0, Math.min(earned, MAX_XP - (total - earned)));
}
