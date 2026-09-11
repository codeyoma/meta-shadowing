import { parseAccountSnapshot, SNAPSHOT_MAX_BYTES, type AccountSnapshot, type SnapshotRun, type SnapshotCompletion } from "./account-snapshot";
import { DEFAULT_SESSION_SETTINGS, type SessionSettings } from "./session-settings";

export type LearningMerge = {
  protocolVersion: 1; accountId: string;
  runs: SnapshotRun[]; history: SnapshotCompletion[]; studyDays: string[];
  options?: { expectedRevision: number; preferredLevel: number; settings: Partial<SessionSettings> };
};
export type LearningMergeErrorCode = "client-update-required" | "options-conflict" | "invalid-merge" | "merge-limit" | "account-changed";
export class LearningMergeError extends Error {
  constructor(readonly code: LearningMergeErrorCode) { super(code); this.name = "LearningMergeError"; }
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function checkLimits(value: { runs?: unknown; history?: unknown; studyDays?: unknown }): void {
  if ((Array.isArray(value.runs) && value.runs.length > 2000)
    || (Array.isArray(value.history) && value.history.length > 10000)
    || (Array.isArray(value.studyDays) && value.studyDays.length > 36600)
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > SNAPSHOT_MAX_BYTES) throw new LearningMergeError("merge-limit");
}

export function parseLearningMerge(value: unknown, accountId: string): LearningMerge {
  try {
    if (!object(value)) throw new LearningMergeError("invalid-merge");
    if (value.protocolVersion !== 1) throw new LearningMergeError("client-update-required");
    if (typeof value.accountId === "string" && value.accountId !== accountId) throw new LearningMergeError("account-changed");
    const hasOptions = Object.hasOwn(value, "options");
    if (!exactKeys(value, ["protocolVersion", "accountId", "runs", "history", "studyDays", ...(hasOptions ? ["options"] : [])])) throw new LearningMergeError("invalid-merge");
    const options = value.options;
    if (hasOptions && (!object(options) || !exactKeys(options, ["expectedRevision", "preferredLevel", "settings"])
      || !Number.isSafeInteger(options.expectedRevision) || Number(options.expectedRevision) < 0)) throw new LearningMergeError("invalid-merge");
    checkLimits(value);
    const portable = { schemaVersion: 1, accountId: value.accountId,
      preferredLevel: hasOptions ? (options as Record<string, unknown>).preferredLevel : 1,
      settings: hasOptions ? (options as Record<string, unknown>).settings : {},
      runs: value.runs, history: value.history, studyDays: value.studyDays,
    };
    checkLimits(portable);
    const parsed = parseAccountSnapshot(portable, accountId);
    return { protocolVersion: 1, accountId: parsed.accountId, runs: parsed.runs, history: parsed.history, studyDays: parsed.studyDays,
      ...(hasOptions ? { options: { expectedRevision: Number((options as Record<string, unknown>).expectedRevision), preferredLevel: parsed.preferredLevel, settings: parsed.settings } } : {}) };
  } catch (error) {
    if (error instanceof LearningMergeError) throw error;
    throw new LearningMergeError("invalid-merge");
  }
}

// The same code-point order is used by SQL's C collation, including astral text.
function compareText(a: string, b: string): number {
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}
function canonical(value: unknown): string {
  if (object(value)) return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function withoutTime(run: SnapshotRun): Record<string, unknown> {
  const { activeMs: _activeMs, ...rest } = run;
  return rest;
}
function compareActive(a: SnapshotRun, b: SnapshotRun): number {
  return a.nextPhrase - b.nextPhrase || compareText(canonical(a.settings), canonical(b.settings))
    || a.confirmedCycles - b.confirmedCycles || a.nextUnit - b.nextUnit
    || compareText(canonical(withoutTime(a)), canonical(withoutTime(b)));
}
function completed(run: SnapshotRun): run is SnapshotCompletion { return "completedAt" in run; }
function mergeRun(a: SnapshotRun, b: SnapshotRun): SnapshotRun {
  if (["lessonId", "lessonVersion", "language", "level", "stage"].some(key => a[key as keyof SnapshotRun] !== b[key as keyof SnapshotRun])) throw new LearningMergeError("invalid-merge");
  let winner: SnapshotRun;
  if (completed(a) && completed(b)) {
    const order = Date.parse(a.completedAt) - Date.parse(b.completedAt) || compareText(canonical(withoutTime(a)), canonical(withoutTime(b)));
    winner = order <= 0 ? a : b;
  } else if (completed(a) || completed(b)) winner = completed(a) ? a : b;
  else winner = compareActive(a, b) >= 0 ? a : b;
  return { ...winner, activeMs: Math.max(a.activeMs, b.activeMs) };
}

export function mergeLearning(snapshot: AccountSnapshot | null, request: LearningMerge): AccountSnapshot {
  const batch = parseLearningMerge(request, request.accountId);
  const saved = snapshot === null ? { schemaVersion: 1 as const, accountId: batch.accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] }
    : parseAccountSnapshot(snapshot, batch.accountId);
  const records = new Map<string, SnapshotRun>();
  for (const item of [...saved.runs, ...saved.history, ...batch.runs, ...batch.history]) {
    const run = completed(item) ? { ...item, completedAt: new Date(item.completedAt).toISOString() } : item;
    const previous = records.get(run.runId);
    records.set(run.runId, previous ? mergeRun(previous, run) : run);
  }
  const ordered = [...records.values()].sort((a, b) => compareText(a.runId, b.runId));
  const merged = { ...saved, ...(batch.options ? { preferredLevel: batch.options.preferredLevel, settings: batch.options.settings } : {}),
    runs: ordered.filter(run => !completed(run)), history: ordered.filter(completed),
    studyDays: [...new Set([...saved.studyDays, ...batch.studyDays])].sort(compareText) };
  checkLimits(merged);
  return parseAccountSnapshot(merged, batch.accountId);
}

// Device objects may carry writer credentials and package data. Project before
// validating; never use this projection to make incoming remote data permissive.
export function projectLearningRun(value: unknown): SnapshotRun | SnapshotCompletion {
  if (!object(value) || !object(value.settings)) throw new LearningMergeError("invalid-merge");
  const keys = ["runId", "lessonId", "lessonVersion", "lessonName", "language", "level", "stage", "nextUnit", "nextPhrase", "activeMs", "confirmedCycles"];
  const projected = { ...Object.fromEntries(keys.map(key => [key, value[key]])),
    settings: Object.fromEntries(Object.keys(DEFAULT_SESSION_SETTINGS).map(key => [key, (value.settings as Record<string, unknown>)[key]])),
    ...(value.completedAt !== undefined && value.completedAt !== null ? { completedAt: value.completedAt } : {}) };
  const isCompletion = "completedAt" in projected;
  const parsed = parseLearningMerge({ protocolVersion: 1, accountId: "projection", runs: isCompletion ? [] : [projected], history: isCompletion ? [projected] : [], studyDays: [] }, "projection");
  return isCompletion ? parsed.history[0] : parsed.runs[0];
}
