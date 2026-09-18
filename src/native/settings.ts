import { getProgressSync } from './progress-sync';
import { decodeSettings, type Settings } from '@/core/settings';
export type { Settings } from '@/core/settings';
export function readSettings(): Settings {
  const sync = getProgressSync();
  return decodeSettings(sync.getSnapshot().learningAvailable ? sync.profiles.readValue('settings') : null);
}
export function saveSettings(settings: Settings, profile: string, authority: number) {
  const sync = getProgressSync();
  return sync.savePreference('settings', JSON.stringify(decodeSettings(JSON.stringify(settings))), authority, profile);
}
