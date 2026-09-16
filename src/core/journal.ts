import { restoreSession, type Session } from './session';
import { Progression, localDay, type BookIdentity } from './progression';
import { createCycleTable, recordCycles } from './cycle-credit';

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
  }
  load(packageKey: string, stage: 1 | 2, phraseCount: number): Session | null {
    const row = this.db.first<{ state: string }>(
      'SELECT state FROM checkpoints WHERE package = ? AND stage = ?', packageKey, stage);
    return row ? restoreSession(row.state, phraseCount, stage) : null;
  }
  save(packageKey: string, state: Session, identity?: BookIdentity): number {
    state = { ...restoreSession(JSON.stringify(state), state.phraseCount, state.stage), running: state.running };
    const json = JSON.stringify(state);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.first<{ state: string }>('SELECT state FROM checkpoints WHERE package=? AND stage=?', packageKey, state.stage);
      const existing = this.db.first('SELECT run FROM completions WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId);
      const earned = recordCycles(this.db, packageKey, state, prior ? JSON.parse(prior.state) : null, identity, !!existing, localDay(this.now()));
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
  completions(packageKey: string, stage: 1 | 2): number {
    return this.db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM completions WHERE package = ? AND stage = ?', packageKey, stage)?.count ?? 0;
  }
}
