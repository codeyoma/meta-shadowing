import type { DeviceLearningRecord, DeviceRun } from "./device-learning-store";
import { isStageForLevel } from "./learning-stages";
import { isLanguage, type Language } from "./languages";
import { DEFAULT_SESSION_SETTINGS, isSessionSettings, validSettingOverrides, type SessionSettings } from "./session-settings";
import { validStudyDay } from "./study-streak";

export const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SNAPSHOT_SCHEMA_VERSION = 1 as const;
const MAX_ACTIVE_RUNS = 2_000;
const MAX_COMPLETIONS = 10_000;
const MAX_STUDY_DAYS = 36_600;
const MAX_IDENTIFIER_LENGTH = 128;

export type SnapshotRun = {
  runId: string;
  lessonId: string;
  lessonVersion: string;
  lessonName: string;
  language: Language;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  stage: number;
  nextUnit: number;
  nextPhrase: number;
  activeMs: number;
  settings: SessionSettings;
  confirmedCycles: number;
};
export type SnapshotCompletion = SnapshotRun & { completedAt: string };
export type AccountSnapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  accountId: string;
  preferredLevel: number;
  settings: Partial<SessionSettings>;
  runs: SnapshotRun[];
  history: SnapshotCompletion[];
  studyDays: string[];
};

export class SnapshotError extends Error {
  readonly code = "INVALID_SNAPSHOT";

  constructor(message = "Account snapshot is invalid", options?: ErrorOptions) {
    super(message, options);
    this.name = "SnapshotError";
  }
}

const snapshotKeys = ["schemaVersion", "accountId", "preferredLevel", "settings", "runs", "history", "studyDays"] as const;
const runKeys = ["runId", "lessonId", "lessonVersion", "lessonName", "language", "level", "stage", "nextUnit", "nextPhrase", "activeMs", "settings", "confirmedCycles"] as const;
const completionKeys = [...runKeys, "completedAt"] as const;
const settingKeys = Object.keys(DEFAULT_SESSION_SETTINGS) as (keyof SessionSettings)[];

function object(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function jsonBytes(value: unknown): number {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Not JSON");
    return new TextEncoder().encode(encoded).byteLength;
  } catch (cause) {
    throw new SnapshotError("Account snapshot is not valid JSON", { cause });
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Array.from(value).length <= MAX_IDENTIFIER_LENGTH;
}

function timestamp(value: unknown, maxFractionDigits: 3 | 6 = 3): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match || !validStudyDay(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
  if ((value.match(/\.(\d+)/)?.[1].length ?? 0) > maxFractionDigits) return false;
  if (match[5] && (Number(match[6]) > 23 || Number(match[7]) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function counter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function projectSettings(value: Partial<SessionSettings> | SessionSettings): Partial<SessionSettings> {
  return Object.fromEntries(settingKeys.flatMap(key => value[key] === undefined ? [] : [[key, value[key]]])) as Partial<SessionSettings>;
}

function parseSettings(value: unknown, complete: boolean): Partial<SessionSettings> | SessionSettings {
  if (!object(value)) throw new SnapshotError("Account snapshot settings are invalid");
  const keys = Object.keys(value);
  if (keys.some(key => !settingKeys.includes(key as keyof SessionSettings))) throw new SnapshotError("Account snapshot settings contain unknown fields");
  const valid = validSettingOverrides(value);
  if (Object.keys(valid).length !== keys.length || (complete && !isSessionSettings(value))) throw new SnapshotError("Account snapshot settings are invalid");
  return projectSettings(valid);
}

function parseRun(value: unknown, completed: boolean): SnapshotRun | SnapshotCompletion {
  if (!object(value) || !exactKeys(value, completed ? completionKeys : runKeys)) throw new SnapshotError("Account snapshot run fields are invalid");
  const level = value.level;
  // PostgreSQL publication versions retain microseconds as exact package identities.
  if (!identifier(value.runId) || !identifier(value.lessonId) || !timestamp(value.lessonVersion, 6)
    || typeof value.lessonName !== "string" || !isLanguage(value.language)
    || !Number.isSafeInteger(level) || Number(level) < 1 || Number(level) > 8 || !isStageForLevel(value.stage, Number(level))
    || !counter(value.nextUnit) || !counter(value.nextPhrase) || !counter(value.activeMs)
    || !counter(value.confirmedCycles) || Number(value.confirmedCycles) > 5
    || (Number(level) >= 6 && value.confirmedCycles !== 0)
    || (completed && !timestamp(value.completedAt))) throw new SnapshotError("Account snapshot run is invalid");
  const settings = parseSettings(value.settings, true) as SessionSettings;
  const run: SnapshotRun = {
    runId: value.runId, lessonId: value.lessonId, lessonVersion: value.lessonVersion, lessonName: value.lessonName,
    language: value.language, level: Number(level) as SnapshotRun["level"], stage: Number(value.stage), nextUnit: Number(value.nextUnit),
    nextPhrase: Number(value.nextPhrase), activeMs: Number(value.activeMs), settings, confirmedCycles: Number(value.confirmedCycles),
  };
  return completed ? { ...run, completedAt: value.completedAt as string } : run;
}

export function parseAccountSnapshot(value: unknown, accountId: string): AccountSnapshot {
  if (jsonBytes(value) > SNAPSHOT_MAX_BYTES) throw new SnapshotError("Account snapshot exceeds the size limit");
  if (!object(value) || !exactKeys(value, snapshotKeys)) throw new SnapshotError("Account snapshot fields are invalid");
  if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new SnapshotError("Account snapshot version is unsupported");
  if (!identifier(value.accountId) || value.accountId !== accountId) throw new SnapshotError("Account snapshot belongs to another account");
  if (!Number.isSafeInteger(value.preferredLevel) || Number(value.preferredLevel) < 1 || Number(value.preferredLevel) > 8) throw new SnapshotError("Account snapshot level is invalid");
  if (!Array.isArray(value.runs) || value.runs.length > MAX_ACTIVE_RUNS || !Array.isArray(value.history) || value.history.length > MAX_COMPLETIONS) throw new SnapshotError("Account snapshot record limit is invalid");
  if (!Array.isArray(value.studyDays) || value.studyDays.length > MAX_STUDY_DAYS
    || value.studyDays.some(day => !validStudyDay(day))
    || new Set(value.studyDays).size !== value.studyDays.length) throw new SnapshotError("Account snapshot study days are invalid");
  const runs = value.runs.map(run => parseRun(run, false) as SnapshotRun);
  const history = value.history.map(run => parseRun(run, true) as SnapshotCompletion);
  const ids = [...runs, ...history].map(run => run.runId);
  if (new Set(ids).size !== ids.length) throw new SnapshotError("Account snapshot run identities are duplicated");
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION, accountId: value.accountId, preferredLevel: Number(value.preferredLevel),
    settings: parseSettings(value.settings, false), runs, history, studyDays: [...value.studyDays],
  };
}

function projectRun(run: DeviceRun): SnapshotRun {
  if (!isStageForLevel(run.stage, run.level)) throw new SnapshotError("Account snapshot run is invalid");
  return {
    runId: run.runId, lessonId: run.lessonId, lessonVersion: run.lessonVersion, lessonName: run.lessonName,
    language: run.language, level: run.level, stage: run.stage, nextUnit: run.nextUnit, nextPhrase: run.nextPhrase,
    activeMs: run.activeMs, settings: projectSettings(run.settings) as SessionSettings, confirmedCycles: run.confirmedCycles,
  };
}

export function exportAccountSnapshot(record: DeviceLearningRecord): AccountSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION, accountId: record.accountId, preferredLevel: record.preferredLevel,
    settings: projectSettings(record.settings), runs: record.runs.map(projectRun),
    history: record.history.map(run => ({ ...projectRun(run), completedAt: run.completedAt })), studyDays: [...record.studyDays],
  };
}

export function snapshotHasContent(snapshot: AccountSnapshot): boolean {
  return snapshot.preferredLevel !== 1 || snapshot.runs.length > 0 || snapshot.history.length > 0 || snapshot.studyDays.length > 0
    || settingKeys.some(key => snapshot.settings[key] !== undefined && snapshot.settings[key] !== DEFAULT_SESSION_SETTINGS[key]);
}
