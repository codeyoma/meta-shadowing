import { Journal, type Database } from './journal';
import { columns, validateProgressBackup, validateValue, type Table, type Row, type ProgressBackup } from './progress-backup-codec';
export { validateProgressBackup, type ProgressBackup } from './progress-backup-codec';

export interface BackupDatabase extends Database {
  all<T>(sql: string, ...args: (string | number)[]): T[];
}

export class ProgressBackupStore {
  readonly journal: Journal;
  constructor(private db: BackupDatabase, now: () => Date = () => new Date()) {
    db.exec(`CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS backup_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
        acknowledged INTEGER NOT NULL CHECK(acknowledged BETWEEN 0 AND revision));
      INSERT OR IGNORE INTO backup_state(id,revision,acknowledged) VALUES (1,0,0);`);
    this.journal = new Journal(db, now, () => this.markChanged());
    // Existing guest history predates backup metadata and still needs publication.
    if (this.hasData()) db.run('UPDATE backup_state SET revision=1 WHERE id=1 AND revision=0');
  }
  private markChanged(): void { this.db.run('UPDATE backup_state SET revision=revision+1 WHERE id=1'); }
  revision(): number { return this.db.first<{ revision: number }>('SELECT revision FROM backup_state WHERE id=1')!.revision; }
  pending(): boolean {
    const row = this.db.first<{ revision: number; acknowledged: number }>('SELECT revision,acknowledged FROM backup_state WHERE id=1')!;
    return row.revision > row.acknowledged;
  }
  acknowledge(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > this.revision()) throw Error('Invalid backup acknowledgement.');
    this.db.run('UPDATE backup_state SET acknowledged=MAX(acknowledged,?) WHERE id=1', revision);
  }
  readValue(key: 'settings' | 'selection'): string | null {
    return this.db.first<{ value: string }>('SELECT value FROM preferences WHERE key=?', key)?.value ?? null;
  }
  saveValue(key: 'settings' | 'selection', value: string): void {
    validateValue(key, value);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.run('INSERT INTO preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
      this.markChanged();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  hasData(): boolean {
    return (Object.keys(columns) as Table[]).some(table => !!this.db.first(`SELECT 1 FROM ${table} LIMIT 1`));
  }
  exportBackup(): string {
    this.db.exec('BEGIN');
    try {
      const json = this.snapshot();
      this.db.exec('COMMIT');
      return json;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private snapshot(): string {
    const tables = {} as ProgressBackup['tables'];
    for (const table of Object.keys(columns) as Table[]) {
      tables[table] = this.db.all<Row>(`SELECT ${columns[table].join(',')} FROM ${table}`);
    }
    return JSON.stringify(validateProgressBackup(JSON.stringify({ version: 1, tables })));
  }
  restoreBackup(json: string): void {
    const backup = validateProgressBackup(json);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.snapshot() === JSON.stringify(backup)) { this.db.exec('COMMIT'); return; }
      if (this.hasData()) throw Error('Cannot replace a different nonempty progress profile.');
      for (const table of Object.keys(columns) as Table[]) {
        for (const row of backup.tables[table]) this.db.run(
          `INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${columns[table].map(() => '?').join(',')})`,
          ...columns[table].map(column => row[column]!));
      }
      this.markChanged();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
