import { getProgressSync } from './progress-sync';
import { decodeSettings, type Settings } from '@/core/settings';
export type { Settings } from '@/core/settings';
export function readSettings(): Settings {
  return decodeSettings(getProgressSync().profiles.readValue('settings'));
}
export function saveSettings(settings: Settings, profile = getProgressSync().profiles.id()) {
  const sync = getProgressSync();
  if (profile !== sync.profiles.id()) return;
  sync.profiles.saveValue('settings', JSON.stringify(decodeSettings(JSON.stringify(settings))), profile);
  sync.changed();
}
