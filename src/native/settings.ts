import Storage from 'expo-sqlite/kv-store';
import { decodeSettings, type Settings } from '@/core/settings';
export type { Settings } from '@/core/settings';
export function readSettings(): Settings {
  return decodeSettings(Storage.getItemSync('practice-settings-v1'));
}
export function saveSettings(settings: Settings) { Storage.setItemSync('practice-settings-v1', JSON.stringify(decodeSettings(JSON.stringify(settings)))); }
