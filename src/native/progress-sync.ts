import { AppState } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { randomUUID } from 'expo-crypto';
import progressCloud from '../../modules/progress-cloud';
import { ProgressProfiles, ProgressSync } from '@/core/progress-sync';
import { decodeSettings } from '@/core/settings';
import { resolveSelection } from '@/core/catalog';
import { books } from './catalog';

let sync: ProgressSync | undefined;
const keys = { settings: 'practice-settings-v1', selection: 'library-selection-v1' };
export function getProgressSync(): ProgressSync {
  if (!sync) {
    const profiles = new ProgressProfiles(id => {
      const db = openDatabaseSync(id === 'guest' ? 'learning-v1.db' : `${id}.db`);
      return {
        exec: sql => {
          db.execSync(sql);
          // Notify only after the actual synchronous transaction commits. A
          // microtask keeps subscriber/cloud failures outside local save calls.
          if (sql === 'COMMIT') queueMicrotask(() => sync?.changed());
        },
        run: (sql, ...args) => { db.runSync(sql, ...args); },
        first: <T>(sql: string, ...args: (string | number)[]) => db.getFirstSync<T>(sql, ...args),
        all: <T>(sql: string, ...args: (string | number)[]) => db.getAllSync<T>(sql, ...args),
      };
    }, () => `progress-${randomUUID()}`, key => {
      const raw = Storage.getItemSync(keys[key]);
      if (raw === null) return null;
      return JSON.stringify(key === 'settings' ? decodeSettings(raw) : resolveSelection(books, JSON.parse(raw)));
    }, (key, value) => { Storage.setItemSync(keys[key], value); });
    sync = new ProgressSync(profiles, progressCloud);
  }
  return sync;
}
export function startProgressSync() {
  const coordinator = getProgressSync();
  const account = progressCloud.addListener('accountChanged', () => { void coordinator.refreshAccount(); });
  const lifecycle = AppState.addEventListener('change', state => {
    coordinator.setActive(state === 'active');
    if (state === 'active') void coordinator.refreshAccount();
    // Let player lifecycle listeners finish their synchronous pause/save first.
    else queueMicrotask(() => { void coordinator.retry(); });
  });
  coordinator.setActive(AppState.currentState === 'active');
  void coordinator.refreshAccount();
  return () => { account.remove(); lifecycle.remove(); coordinator.dispose(); sync = undefined; };
}
