import { isSessionSettings, resolveSessionSettings, validSettingOverrides, type SessionSettings } from "./session-settings";
import type { ProgressRecord, CompletionRecord } from "./learning-records";
import type { PublishedLesson } from "./lessons";
import { assertDeviceAccess, type DeviceAccess } from "./device-access";
import { isStageForLevel } from "./learning-stages";
import { validStudyDay } from "./study-streak";

export const DEVICE_LEARNING_DATABASE = "meta-shadowing-device-learning-v1";
// Schema 2 already stores level, stage, independent unit/phrase indexes, and
// confirmations. Widening their validation needs no data migration and keeps
// existing schema-1 settings and schema-2 level-1 records readable.
export const DEVICE_LEARNING_SCHEMA_VERSION = 2;
const ACCOUNT_STORE = "accounts";

export type DeviceLearningRecord = {
  schemaVersion: typeof DEVICE_LEARNING_SCHEMA_VERSION;
  accountId: string;
  preferredLevel: number;
  settings: Partial<SessionSettings>;
  runs: DeviceRun[];
  history: (DeviceRun & CompletionRecord)[];
  studyDays: string[];
};

export type DeviceRun = ProgressRecord & { level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; confirmedCycles: number; revision: number; completedAt?: string };

export class DeviceLearningStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeviceLearningStoreError";
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  try {
    const request = indexedDB.open(DEVICE_LEARNING_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ACCOUNT_STORE)) {
        request.result.createObjectStore(ACCOUNT_STORE, { keyPath: "accountId" });
      }
    };
    return await requestResult(request);
  } catch (cause) {
    throw new DeviceLearningStoreError("Local learning storage is unavailable", { cause });
  }
}

function parseRecord(value: unknown, accountId: string): DeviceLearningRecord | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DeviceLearningStoreError("Local learning data is malformed");
  const candidate = value as Partial<DeviceLearningRecord>;
  if (candidate.schemaVersion !== DEVICE_LEARNING_SCHEMA_VERSION && candidate.schemaVersion !== (1 as number)) throw new DeviceLearningStoreError("Local learning data uses an unsupported version");
  if (candidate.accountId !== accountId) throw new DeviceLearningStoreError("Local learning data belongs to another account");
  const preferredLevel = candidate.preferredLevel ?? 1;
  if (!Number.isInteger(preferredLevel) || preferredLevel < 1 || preferredLevel > 8) throw new DeviceLearningStoreError("Local learning level is malformed");
  const settings = validSettingOverrides(candidate.settings);
  if (!candidate.settings || typeof candidate.settings !== "object" || Array.isArray(candidate.settings) || Object.keys(settings).length !== Object.keys(candidate.settings).length) {
    throw new DeviceLearningStoreError("Local learning settings are malformed");
  }
  const runs = candidate.runs ?? [], history = candidate.history ?? [];
  const studyDays = candidate.studyDays ?? [];
  if (!Array.isArray(runs) || !Array.isArray(history)) throw new DeviceLearningStoreError("Local learning records are malformed");
  if (!Array.isArray(studyDays) || studyDays.some(day => !validStudyDay(day))) throw new DeviceLearningStoreError("Local study days are malformed");
  for (const run of [...runs, ...history]) {
    const stage = run?.stage === undefined && run?.level === 1 ? 1 : run?.stage;
    if (!run || typeof run.runId !== "string" || !run.runId || typeof run.lessonId !== "string" || !run.lessonId
      || typeof run.lessonVersion !== "string" || !Number.isFinite(Date.parse(run.lessonVersion))
      || !Number.isSafeInteger(run.level) || run.level < 1 || run.level > 8 || !isStageForLevel(stage, run.level)
      || !isSessionSettings(run.settings)
      || ![run.nextUnit, run.nextPhrase, run.activeMs, run.confirmedCycles, run.revision].every(value => Number.isSafeInteger(value) && value >= 0)
      || run.confirmedCycles > 5 || (run.level >= 6 && run.confirmedCycles !== 0)
      || (run.completedAt !== undefined && !Number.isFinite(Date.parse(run.completedAt)))) throw new DeviceLearningStoreError("Local learning run is malformed");
    run.stage = stage;
  }
  if (history.some(run => !run.completedAt) || new Set(history.map(run => run.runId)).size !== history.length) throw new DeviceLearningStoreError("Local completion history is malformed");
  return { schemaVersion: DEVICE_LEARNING_SCHEMA_VERSION, accountId, preferredLevel, settings, runs, history,
    studyDays: [...new Set(studyDays)].sort() };
}

export async function readDeviceLearningRecord(accountId: string): Promise<DeviceLearningRecord | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(ACCOUNT_STORE, "readonly");
    return parseRecord(await requestResult(transaction.objectStore(ACCOUNT_STORE).get(accountId)), accountId);
  } catch (cause) {
    if (cause instanceof DeviceLearningStoreError) throw cause;
    throw new DeviceLearningStoreError("Could not read local learning data", { cause });
  } finally {
    database.close();
  }
}

async function mutateRecord<T>(accountId: string, change: (record: DeviceLearningRecord) => T, access?: DeviceAccess): Promise<T> {
  if (access && access.accountId !== accountId) throw new DeviceLearningStoreError("Local learning data belongs to another account");
  if (access) assertDeviceAccess(access);
  const database = await openDatabase();
  let transaction: IDBTransaction | undefined;
  try {
    transaction = database.transaction(ACCOUNT_STORE, "readwrite", { durability: "strict" });
    const complete = transactionComplete(transaction);
    void complete.catch(() => {});
    const store = transaction.objectStore(ACCOUNT_STORE);
    const record = parseRecord(await requestResult(store.get(accountId)), accountId)
      ?? { schemaVersion: DEVICE_LEARNING_SCHEMA_VERSION, accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] };
    if (access) assertDeviceAccess(access);
    const value = change(record);
    store.put(parseRecord(record, accountId)!);
    await complete;
    window.dispatchEvent(new Event("device-learning-changed"));
    return value;
  } catch (cause) {
    try { transaction?.abort(); } catch { /* Already committed or aborted. */ }
    throw new DeviceLearningStoreError("Could not save local learning data", { cause });
  } finally {
    database.close();
  }
}

export async function writeDeviceLearningSettings(accountId: string, preferredLevel: number, settings: Partial<SessionSettings>, access?: DeviceAccess): Promise<DeviceLearningRecord> {
  return mutateRecord(accountId, record => {
    record.preferredLevel = preferredLevel; record.settings = settings;
    return record;
  }, access);
}

/** Opening an unfinished stage resumes its local identity; completion links are immutable. */
export async function startDeviceRun(access: DeviceAccess, lesson: PublishedLesson, stage: number, requestedRun?: string): Promise<DeviceRun> {
  return mutateRecord(access.accountId, record => {
    const level = Math.ceil(stage / 2);
    if (!isStageForLevel(stage, level)) throw new DeviceLearningStoreError("Learning stage is malformed");
    const matches = (run: DeviceRun) => run.lessonId === lesson.id && run.lessonVersion === lesson.version && run.stage === stage;
    const completed = record.history.find(run => run.runId === requestedRun && matches(run));
    if (completed) return completed;
    const candidates = record.runs.filter(matches).sort((a, b) => a.runId.localeCompare(b.runId));
    const previous = candidates.find(run => run.runId === requestedRun) ?? candidates[0];
    if (previous) return previous;
    const run: DeviceRun = { runId: crypto.randomUUID(), lessonId: lesson.id, lessonVersion: lesson.version,
      lessonName: lesson.name, language: lesson.language, level: level as DeviceRun["level"], stage, nextUnit: 0, nextPhrase: 0, activeMs: 0,
      settings: resolveSessionSettings(record.settings), confirmedCycles: 0, revision: 0 };
    record.runs.push(run);
    return run;
  }, access);
}

/** Revision compare-and-swap prevents a stale tab from rolling back a newer checkpoint. */
export async function saveDeviceRun(access: DeviceAccess, run: DeviceRun, revision: number, studyDay?: string): Promise<DeviceRun> {
  return mutateRecord(access.accountId, record => {
    if (studyDay !== undefined && !validStudyDay(studyDay)) throw new DeviceLearningStoreError("Local study day is malformed");
    const completed = record.history.find(value => value.runId === run.runId);
    if (completed) return completed;
    const index = record.runs.findIndex(value => value.runId === run.runId);
    if (index < 0 || record.runs[index].revision !== revision) throw new DeviceLearningStoreError("Local learning changed in another tab. Reload to continue.");
    const next = { ...run, revision: revision + 1 };
    if (next.completedAt) {
      record.runs.splice(index, 1);
      record.history.push(next as DeviceRun & CompletionRecord);
    } else record.runs[index] = next;
    if (studyDay !== undefined && !record.studyDays.includes(studyDay)) record.studyDays.push(studyDay);
    return next;
  }, access);
}
