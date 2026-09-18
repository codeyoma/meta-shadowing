import { Journal, type Database } from './journal';
import { restoreSession } from './session';
import { columns, encodeProgressBackup, validateProgressBackup, validateValue, type Table, type Row, type ProgressBackup } from './progress-backup-codec';
import { createSyncTable, nextStamp, preferenceKey, readSync, saveSync, seedLedger } from './sync-ledger';
import { mergeProgress } from './progress-merge';
export { validateProgressBackup, type ProgressBackup } from './progress-backup-codec';
export class ProgressMergeError extends Error {
  constructor(message: string) { super(message); this.name = 'ProgressMergeError'; }
}

export interface BackupDatabase extends Database {
  all<T>(sql: string, ...args: (string | number)[]): T[];
}

export class ProgressBackupStore {
  readonly journal: Journal;
  constructor(private db: BackupDatabase, private now: () => Date = () => new Date()) {
    db.exec(`CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS backup_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
        acknowledged INTEGER NOT NULL CHECK(acknowledged BETWEEN 0 AND revision));
      INSERT OR IGNORE INTO backup_state(id,revision,acknowledged) VALUES (1,0,0);`);
    createSyncTable(db);
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
      if (this.readValue(key) === value) { this.db.exec('COMMIT'); return; }
      this.db.run('INSERT INTO preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
      const ledger = readSync(this.db, '');
      ledger.clocks[preferenceKey(key)] = nextStamp(this.db, ledger, this.now().getTime());
      saveSync(this.db, ledger, true);
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
    // Normalize historical local checkpoint extras before encoding. External
    // v1/v2 payloads still pass the codec's exact field-set validation first.
    tables.checkpoints = tables.checkpoints.map(row => {
      const state = JSON.parse(String(row.state));
      return { ...row, state: JSON.stringify(restoreSession(String(row.state), state.version === 2 ? state.sourcePhraseCount : state.phraseCount, state.stage)) };
    });
    return encodeProgressBackup(validateProgressBackup(encodeProgressBackup({ version: 4, tables, sync: seedLedger(tables, readSync(this.db)) })));
  }
  restoreBackup(json: string): void {
    const backup = validateProgressBackup(json);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.snapshot() === encodeProgressBackup(backup)) { this.db.exec('COMMIT'); return; }
      if (this.hasData()) throw Error('Cannot replace a different nonempty progress profile.');
      for (const table of Object.keys(columns) as Table[]) {
        for (const row of backup.tables[table]) this.db.run(
          `INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${columns[table].map(() => '?').join(',')})`,
          ...columns[table].map(column => row[column]!));
      }
      saveSync(this.db, backup.sync);
      this.markChanged();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  mergeBackup(json: string): void { this.mergeBackups([json]); }
  mergeBackups(jsons: readonly string[]): void {
    let incoming: ProgressBackup[];
    try { incoming = jsons.map(validateProgressBackup); }
    catch { throw new ProgressMergeError('Progress backup is incompatible or damaged.'); }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.snapshot();
      let canonical: ProgressBackup;
      try { canonical = validateProgressBackup(encodeProgressBackup(incoming.reduce(mergeProgress, validateProgressBackup(before)))); }
      catch { throw new ProgressMergeError('Progress backup is incompatible or damaged.'); }
      if (encodeProgressBackup(canonical) === before) { this.db.exec('COMMIT'); return; }
      for (const table of Object.keys(columns) as Table[]) {
        this.db.run(`DELETE FROM ${table}`);
        for (const row of canonical.tables[table]) this.db.run(
          `INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${columns[table].map(() => '?').join(',')})`,
          ...columns[table].map(column => row[column]!));
      }
      saveSync(this.db, canonical.sync);
      this.markChanged();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  exportWithPreferences(values: Partial<Record<'settings' | 'selection', string>>): string {
    const backup = validateProgressBackup(this.exportBackup());
    for (const key of ['settings', 'selection'] as const) if (values[key] !== undefined) {
      if (backup.sync.clocks[preferenceKey(key)]) continue;
      const value = validateValue(key, values[key]);
      backup.tables.preferences = backup.tables.preferences.filter(row => row.key !== key);
      backup.tables.preferences.push({ key, value });
      backup.sync.clocks[preferenceKey(key)] ??= '';
    }
    return encodeProgressBackup(validateProgressBackup(encodeProgressBackup(backup)));
  }
}
