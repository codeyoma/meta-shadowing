import type { BackupDatabase } from './progress-backup';

export type LocalRemoval = { profile: string; scope: string };
export type CloudDeletion = { scope: string; profile: string; request: string; expected: string };
/** Protocol intent lives in the registry, outside all erased learning tables. */
export class ProgressDeletions {
  constructor(private db: BackupDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS local_removals(profile TEXT PRIMARY KEY, scope TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cloud_deletions(scope TEXT PRIMARY KEY, profile TEXT NOT NULL, request TEXT NOT NULL, expected TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS removed_guest(id INTEGER PRIMARY KEY CHECK(id=1));`);
  }
  local(profile: string) { return this.db.first<LocalRemoval>('SELECT profile,scope FROM local_removals WHERE profile=?', profile); }
  beginLocal(profile: string, scope: string) { this.db.run('INSERT OR IGNORE INTO local_removals VALUES(?,?)', profile, scope); }
  finishLocal(profile: string) { this.db.run('DELETE FROM local_removals WHERE profile=?', profile); }
  cloud(scope: string) { return this.db.first<CloudDeletion>('SELECT scope,profile,request,expected FROM cloud_deletions WHERE scope=?', scope); }
  beginCloud(intent: CloudDeletion) { this.db.run('INSERT OR IGNORE INTO cloud_deletions VALUES(?,?,?,?)', intent.scope, intent.profile, intent.request, intent.expected); }
  finishCloud(scope: string) { this.db.run('DELETE FROM cloud_deletions WHERE scope=?', scope); }
  guestRemoved() { return !!this.db.first('SELECT 1 FROM removed_guest'); }
  removeGuest() { this.db.run('INSERT OR IGNORE INTO removed_guest VALUES(1)'); }
}
