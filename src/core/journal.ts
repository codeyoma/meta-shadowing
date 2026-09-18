import { restoreSession, transition, type Session } from './session';
import { Progression, localDay, type BookIdentity } from './progression';
import { createCycleTable, recordCycles, validCycleIdentity } from './cycle-credit';
import type { PlayableStage } from './catalog';
import { bindRun, checkpointKey, createSyncTable, creditTotal, nextStamp, preferenceKey, readSync, saveSync, type SyncRun } from './sync-ledger';
import { unitProgress } from './unit-progress';

export interface Database {
  exec(sql: string): void;
  run(sql: string, ...args: (string | number)[]): void;
  first<T>(sql: string, ...args: (string | number)[]): T | null | undefined;
}

export class Journal {
  readonly progress: Progression;
  constructor(private db: Database, private now: () => Date = () => new Date(), private onSaved?: () => void) {
    db.exec(`PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS checkpoints (
        package TEXT NOT NULL, stage INTEGER NOT NULL, state TEXT NOT NULL,
        PRIMARY KEY(package, stage));
      CREATE TABLE IF NOT EXISTS completions (
        package TEXT NOT NULL, stage INTEGER NOT NULL, run TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(package, stage, run));`);
    this.progress = new Progression(db, now);
    createCycleTable(db);
    createSyncTable(db);
  }
  load(packageKey: string, stage: PlayableStage, phraseCount: number): Session | null {
    const row = this.db.first<{ state: string }>(
      'SELECT state FROM checkpoints WHERE package = ? AND stage = ?', packageKey, stage);
    if (!row) return null;
    const state = restoreSession(row.state, phraseCount, stage);
    // Completion closes resume eligibility, not independently confirmed evidence.
    if (state.phase !== 'complete' && this.db.first('SELECT 1 FROM completions WHERE package=? AND stage=? AND run=?', packageKey, stage, state.runId)) return null;
    return state;
  }
  /** A player owns its predecessor even if another device wins the resume slot. */
  createWriter(packageKey: string, initial: Session, identity?: BookIdentity): (state: Session) => number {
    let prior = initial;
    return state => {
      const earned = this.savePinned(packageKey, state, prior, identity);
      prior = state;
      return earned;
    };
  }
  latestStage(packageKey: string): number | null {
    const candidates = Object.entries(readSync(this.db).clocks).flatMap(([key, stamp]) => {
      const [kind, book, stage] = JSON.parse(key);
      return kind === 'checkpoint' && book === packageKey && stamp ? [{ stage: Number(stage), stamp }] : [];
    }).sort((a, b) => a.stamp === b.stamp ? b.stage - a.stage : a.stamp > b.stamp ? -1 : 1);
    return candidates[0]?.stage ?? null;
  }
  private savePinned(packageKey: string, input: Session, prior: Session, identity?: BookIdentity): number {
    const state = { ...restoreSession(JSON.stringify(input), input.version === 2 ? input.sourcePhraseCount : input.phraseCount, input.stage), running: input.running };
    const equal = (a: Session, b: Session, ignoreRunning = false) => Object.keys(b).every(key => (ignoreRunning && key === 'running')
      || JSON.stringify(a[key as keyof Session]) === JSON.stringify(b[key as keyof Session]));
    if (equal(prior, state, true)) return 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = identity ? this.progress.summary(identity.language).xp : 0;
      const ledger = readSync(this.db), day = localDay(this.now());
      let run: SyncRun | undefined;
      if (identity) {
        if (!validCycleIdentity(packageKey, identity)) throw Error('Invalid cycle identity.');
        const bound = this.db.first<{ language: string; book: string }>('SELECT language,book FROM cycle_credits WHERE package=? LIMIT 1', packageKey);
        if (bound && (bound.language !== identity.language || bound.book !== identity.book)) throw Error('Conflicting package identity.');
        run = bindRun(this.db, ledger, packageKey, prior.runId === state.runId ? prior : state, identity);
        bindRun(this.db, ledger, packageKey, state, identity);
        const accepted = prior.runId === state.runId && prior.phase === 'speaking'
          && unitProgress(state)[prior.phrase]!.confirmed === prior.confirmed + 1
          && (['confirm', 'repeat', 'next'] as const).some(type => equal(transition(prior, { type }), state));
        if (accepted) {
          const existing = run.events.find(event => event.unit === prior.phrase && event.ordinal === prior.confirmed + 1);
          if (!existing) run.events.push({ unit: prior.phrase, ordinal: prior.confirmed + 1, day });
          else existing.day = existing.day < day ? existing.day : day;
        }
        run.observed = run.observed.map((count, i) => Math.max(count, unitProgress(state)[i]!.confirmed));
        const old = this.db.first<{ phrase: number; confirmed: number; day: string }>('SELECT phrase,confirmed,day FROM cycle_credits WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId);
        let phrase = old && (old.phrase > state.phrase || (old.phrase === state.phrase && old.confirmed > state.confirmed)) ? old.phrase : state.phrase;
        let confirmed = run.observed[phrase]!;
        const completed = state.phase === 'complete' || !!this.db.first('SELECT 1 FROM completions WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId);
        if (completed) { phrase = state.phraseCount - 1; confirmed = run.observed[phrase]!; }
        const completionDay = old?.day || (state.phase === 'complete' ? day : '');
        if (completionDay) this.db.run('INSERT OR IGNORE INTO study_days(language,day) VALUES (?,?)', identity.language, completionDay);
        if (state.phase === 'complete') this.db.run('INSERT OR IGNORE INTO study_days(language,day) VALUES (?,?)', identity.language, day);
        this.db.run(`INSERT INTO cycle_credits VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(package,stage,run) DO UPDATE SET phrase=excluded.phrase,confirmed=excluded.confirmed,credited=excluded.credited,day=excluded.day`,
          packageKey, state.stage, state.runId, identity.language, identity.book, state.phraseCount, phrase, confirmed, creditTotal(run), completionDay);
        this.db.run('INSERT INTO unit_credits VALUES (?,?,?,?) ON CONFLICT(package,stage,run) DO UPDATE SET state=excluded.state',
          packageKey, state.stage, state.runId, JSON.stringify({ counts: run.observed, sourceCount: run.sourceCount, groupSize: run.groupSize, baseline: creditTotal(run), earned: 0 }));
      }
      const stamp = nextStamp(this.db, ledger, this.now().getTime());
      ledger.clocks[checkpointKey(packageKey, state.stage)] = stamp;
      if (identity && this.db.first("SELECT 1 FROM sqlite_master WHERE type='table' AND name='preferences'")) {
        this.db.run('INSERT INTO preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'selection',
          JSON.stringify({ language: identity.language, book: identity.book, packageKey }));
        ledger.clocks[preferenceKey('selection')] = stamp;
      }
      this.db.run('INSERT INTO checkpoints VALUES (?,?,?) ON CONFLICT(package,stage) DO UPDATE SET state=excluded.state', packageKey, state.stage, JSON.stringify(state));
      if (state.phase === 'complete') this.db.run('INSERT OR IGNORE INTO completions(package,stage,run,completed_at) VALUES (?,?,?,?)', packageKey, state.stage, state.runId, this.now().toISOString());
      saveSync(this.db, ledger); this.onSaved?.();
      const earned = identity ? this.progress.summary(identity.language).xp - before : 0;
      this.db.exec('COMMIT'); return earned;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  save(packageKey: string, state: Session, identity?: BookIdentity): number {
    state = { ...restoreSession(JSON.stringify(state), state.version === 2 ? state.sourcePhraseCount : state.phraseCount, state.stage), running: state.running };
    const json = JSON.stringify(state);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.first<{ state: string }>('SELECT state FROM checkpoints WHERE package=? AND stage=?', packageKey, state.stage);
      const ledger = readSync(this.db);
      const boundRun = identity ? bindRun(this.db, ledger, packageKey, prior && JSON.parse(prior.state).runId === state.runId ? JSON.parse(prior.state) : state, identity) : undefined;
      const creditedBefore = boundRun ? creditTotal(boundRun) : 0;
      if (prior) {
        const old = JSON.parse(prior.state);
        if (old.runId === state.runId && (old.version !== state.version || old.phraseCount !== state.phraseCount
          || (state.version === 2 && (old.sourcePhraseCount !== state.sourcePhraseCount || old.groupSize !== state.groupSize)))) {
          throw Error('Cannot change an existing run plan.');
        }
      }
      const existing = this.db.first('SELECT run FROM completions WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId);
      const earned = recordCycles(this.db, packageKey, state, prior ? JSON.parse(prior.state) : null, identity, !!existing, localDay(this.now()));
      if (boundRun) {
        const row = this.db.first<{ credited: number }>('SELECT credited FROM cycle_credits WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId)!;
        const unit = this.db.first<{ state: string }>('SELECT state FROM unit_credits WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId);
        if (row.credited > creditedBefore && prior) {
          const predecessor = JSON.parse(prior.state) as Session, day = localDay(this.now());
          if (!boundRun.events.some(event => event.unit === predecessor.phrase && event.ordinal === predecessor.confirmed + 1)) {
            boundRun.events.push({ unit: predecessor.phrase, ordinal: predecessor.confirmed + 1, day });
          }
        }
        boundRun.observed = unit ? JSON.parse(unit.state).counts : boundRun.observed.map((count, i) => Math.max(count, unitProgress(state)[i]!.confirmed));
      }
      if (!prior || JSON.stringify({ ...JSON.parse(prior.state), running: false }) !== JSON.stringify({ ...state, running: false })) {
        ledger.clocks[checkpointKey(packageKey, state.stage)] = nextStamp(this.db, ledger, this.now().getTime());
      }
      saveSync(this.db, ledger);
      this.db.run('INSERT INTO checkpoints (package,stage,state) VALUES (?,?,?) ON CONFLICT(package,stage) DO UPDATE SET state=excluded.state',
        packageKey, state.stage, json);
      if (state.phase === 'complete') {
        this.db.run('INSERT OR IGNORE INTO completions (package,stage,run) VALUES (?,?,?)', packageKey, state.stage, state.runId);
      }
      this.onSaved?.();
      this.db.exec('COMMIT');
      return earned;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  completions(packageKey: string, stage: PlayableStage): number {
    return this.db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM completions WHERE package = ? AND stage = ?', packageKey, stage)?.count ?? 0;
  }
}
