import { PLAYBACK_RATES } from "./audio-session";
import { isGroupSize, type GroupSize } from "./phrase-groups";
import { DEFAULT_RAPID_SETTINGS, isRapidDelay, isWpmLevel, type RapidSettings } from "./rapid-session";

export type SessionSettings = RapidSettings & {
  speed: number;
  advanceDelayMs: number;
  groupSize: GroupSize;
  groupGapMs: number;
};

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  ...DEFAULT_RAPID_SETTINGS, speed: 1, advanceDelayMs: 1000, groupSize: 2, groupGapMs: 500
};

const validators: { [K in keyof SessionSettings]: (value: unknown) => boolean } = {
  mode: value => value === "manual" || value === "automatic",
  display: value => value === "current" || value === "cumulative",
  speed: value => typeof value === "number" && PLAYBACK_RATES.includes(value),
  groupSize: isGroupSize,
  wpmLevel: isWpmLevel,
  advanceDelayMs: isRapidDelay,
  groupGapMs: isRapidDelay,
  speakingExtraMs: isRapidDelay,
  lineGapMs: isRapidDelay,
  sectionGapMs: isRapidDelay
};

export function validSettingOverrides(value: unknown): Partial<SessionSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    Object.hasOwn(validators, key) && validators[key as keyof SessionSettings](item)
  ));
}

export function isSessionSettings(value: unknown): value is SessionSettings {
  return Object.keys(validSettingOverrides(value)).length === Object.keys(validators).length;
}

export function resolveSessionSettings(value: unknown, defaults = DEFAULT_SESSION_SETTINGS): SessionSettings {
  return { ...defaults, ...validSettingOverrides(value) };
}

const PREFERENCES_KEY = "meta-shadowing:preferences:v1";

export function readSessionPreferences(defaults = DEFAULT_SESSION_SETTINGS): SessionSettings {
  try {
    return resolveSessionSettings(JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null"), defaults);
  } catch {
    return defaults;
  }
}

// Persist only fields the learner actually changed, so untouched fields still inherit admin defaults.
export function saveSessionPreferences(changes: Partial<SessionSettings>): void {
  try {
    let previous: unknown;
    try { previous = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null"); } catch { previous = null; }
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...validSettingOverrides(previous), ...validSettingOverrides(changes) }));
  } catch {
    // Browser storage can be disabled or full; practice remains available.
  }
}
