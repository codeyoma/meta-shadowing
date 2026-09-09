import type { BrowseSelection } from "./browse-navigation";
import { isLanguage } from "./languages";
import { validSettingOverrides, type SessionSettings } from "./session-settings";

export type PreferenceChanges = Partial<SessionSettings> & { selection?: BrowseSelection };
export type LearnerPreferences = {
  accountId: string;
  overrides: Partial<SessionSettings>;
  selection: BrowseSelection | null;
  studyTimeZone: string;
  revision: number;
};
export type PreferenceSnapshot = { profile: LearnerPreferences; defaults: SessionSettings };
export type PreferencePatch = { accountId: string; revision: number; changes: PreferenceChanges };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parsePreferencePatch(value: unknown): PreferencePatch | null {
  if (!object(value) || Object.keys(value).some(key => !["accountId", "revision", "changes"].includes(key))
    || typeof value.accountId !== "string" || !uuid.test(value.accountId)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !object(value.changes)) return null;
  const { selection, ...settings } = value.changes;
  if (Object.keys(value.changes).length === 0 || Object.keys(validSettingOverrides(settings)).length !== Object.keys(settings).length) return null;
  if ("selection" in value.changes && (!object(selection) || Object.keys(selection).length !== 2 || !isLanguage(selection.language)
    || !(selection.lessonId === null || (typeof selection.lessonId === "string" && uuid.test(selection.lessonId))))) return null;
  return value as PreferencePatch;
}

export function studyTimeZone(value: string | null | undefined): string {
  try {
    if (value && value.length <= 100) return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch { /* Invalid device settings use the explicit UTC fallback. */ }
  return "UTC";
}
