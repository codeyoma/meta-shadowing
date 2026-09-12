import { openDatabaseSync } from 'expo-sqlite';
import { Journal } from '../core/journal';

let journal: Journal | undefined;
export function getJournal(): Journal {
  if (!journal) {
    const db = openDatabaseSync('learning-v1.db');
    journal = new Journal({
      exec: sql => db.execSync(sql),
      run: (sql, ...args) => { db.runSync(sql, ...args); },
      first: <T>(sql: string, ...args: (string | number)[]) => db.getFirstSync<T>(sql, ...args),
    });
  }
  return journal;
}
