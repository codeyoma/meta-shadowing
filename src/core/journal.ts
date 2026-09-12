import { restoreSession, type Session } from './session';
import { Progression, type BookIdentity } from './progression';

export interface Database {
  exec(sql: string): void;
  run(sql: string, ...args: (string | number)[]): void;
  first<T>(sql: string, ...args: (string | number)[]): T | null | undefined;
}

export class Journal {
  readonly progress: Progression;
  constructor(private db: Database, now: () => Date = () => new Date(), private onSaved?: () => void) {
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
  }
  load(packageKey: string, stage: 1 | 2, phraseCount: number): Session | null {
    const row = this.db.first<{ state: string }>(
      'SELECT state FROM checkpoints WHERE package = ? AND stage = ?', packageKey, stage);
    return row ? restoreSession(row.state, phraseCount, stage) : null;
  }
  save(packageKey: string, state: Session, identity?: BookIdentity): void {
    const json = JSON.stringify(state);
    restoreSession(json, state.phraseCount, state.stage);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.run('INSERT INTO checkpoints (package,stage,state) VALUES (?,?,?) ON CONFLICT(package,stage) DO UPDATE SET state=excluded.state',
        packageKey, state.stage, json);
      if (state.phase === 'complete') {
        const existing = this.db.first('SELECT run FROM completions WHERE package=? AND stage=? AND run=?', packageKey, state.stage, state.runId);
        this.db.run('INSERT OR IGNORE INTO completions (package,stage,run) VALUES (?,?,?)', packageKey, state.stage, state.runId);
        if (!existing && identity) this.progress.record({ ...identity, stage: state.stage, run: state.runId });
      }
      this.onSaved?.();
      this.db.exec('COMMIT');
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
