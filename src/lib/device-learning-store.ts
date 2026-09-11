import { isSessionSettings, resolveSessionSettings, validSettingOverrides, type SessionSettings } from "./session-settings";
import type { ProgressRecord, CompletionRecord } from "./learning-records";
import type { PublishedLesson } from "./lessons";
import { assertDeviceAccess, subscribeDeviceAccess, type DeviceAccess } from "./device-access";
import { isStageForLevel } from "./learning-stages";
import { validStudyDay } from "./study-streak";
import { parseAccountSnapshot, snapshotHasContent, type AccountSnapshot } from "./account-snapshot";
import type { LearningMerge } from "./learning-merge";
import { LEARNING_OUTBOX_STORE, outboxRequest, queueLearningChanges, readLearningOutbox, type LearningOutbox } from "./device-learning-outbox";

export type LearningSyncBatch = { access: DeviceAccess; generation: string; request: LearningMerge; sequences: Record<string, number> };

export const DEVICE_LEARNING_DATABASE = "meta-shadowing-device-learning-v1";
// Schema 2 already stores level, stage, independent unit/phrase indexes, and
// confirmations. Widening their validation needs no data migration and keeps
// existing schema-1 settings and schema-2 level-1 records readable.
// IndexedDB version 3 adds the outbox; the learning record format remains 2.
export const DEVICE_LEARNING_SCHEMA_VERSION = 2;
const ACCOUNT_STORE = "accounts";
const SNAPSHOT_STORE = "snapshots";
const SNAPSHOT_EVENT = "device-snapshot-replaced";
type SnapshotState = { accountId: string; generation: string; backup?: DeviceLearningRecord | null };
export type DeviceWriter = DeviceAccess & { generation: string };

/** No personal payload crosses tabs; consumers reload their own account. */
export function subscribeDeviceSnapshot(listener: () => void) {
  const channel = new BroadcastChannel(SNAPSHOT_EVENT);
  channel.onmessage = () => { window.dispatchEvent(new Event("device-learning-changed")); listener(); };
  window.addEventListener(SNAPSHOT_EVENT, listener);
  return () => { channel.close(); window.removeEventListener(SNAPSHOT_EVENT, listener); };
}

function notifySnapshot() {
  window.dispatchEvent(new Event(SNAPSHOT_EVENT));
  window.dispatchEvent(new Event("device-learning-changed"));
  const channel = new BroadcastChannel(SNAPSHOT_EVENT);
  channel.postMessage(null);
  channel.close();
}

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
    const request = indexedDB.open(DEVICE_LEARNING_DATABASE, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ACCOUNT_STORE)) {
        request.result.createObjectStore(ACCOUNT_STORE, { keyPath: "accountId" });
      }
      if (!request.result.objectStoreNames.contains(SNAPSHOT_STORE)) request.result.createObjectStore(SNAPSHOT_STORE, { keyPath: "accountId" });
      if (!request.result.objectStoreNames.contains(LEARNING_OUTBOX_STORE)) request.result.createObjectStore(LEARNING_OUTBOX_STORE, { keyPath: "accountId" });
    };
    const database = await requestResult(request);
    database.onversionchange = () => database.close();
    return database;
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

export async function readDeviceLearningState(access: DeviceAccess): Promise<{ record: DeviceLearningRecord | null; writer: DeviceWriter }> {
  assertDeviceAccess(access);
  const database = await openDatabase();
  try {
    const tx = database.transaction([ACCOUNT_STORE, SNAPSHOT_STORE], "readonly");
    const [raw, state] = await Promise.all([
      requestResult(tx.objectStore(ACCOUNT_STORE).get(access.accountId)),
      requestResult<SnapshotState | undefined>(tx.objectStore(SNAPSHOT_STORE).get(access.accountId)),
    ]);
    assertDeviceAccess(access);
    return { record: parseRecord(raw, access.accountId), writer: { ...access, generation: state?.generation ?? "legacy" } };
  } finally { database.close(); }
}

async function mutateRecord<T>(accountId: string, change: (record: DeviceLearningRecord) => T, access: DeviceWriter): Promise<T> {
  if (access && access.accountId !== accountId) throw new DeviceLearningStoreError("Local learning data belongs to another account");
  if (access) assertDeviceAccess(access);
  const database = await openDatabase();
  let transaction: IDBTransaction | undefined;
  try {
    transaction = database.transaction([ACCOUNT_STORE, SNAPSHOT_STORE, LEARNING_OUTBOX_STORE], "readwrite", { durability: "strict" });
    const complete = transactionComplete(transaction);
    void complete.catch(() => {});
    const store = transaction.objectStore(ACCOUNT_STORE);
    const metadata = await requestResult<SnapshotState | undefined>(transaction.objectStore(SNAPSHOT_STORE).get(accountId));
    if (!access || access.generation !== (metadata?.generation ?? "legacy")) throw new DeviceLearningStoreError("Local learning changed. Reload to continue.");
    const record = parseRecord(await requestResult(store.get(accountId)), accountId)
      ?? { schemaVersion: DEVICE_LEARNING_SCHEMA_VERSION, accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] };
    const outboxStore = transaction.objectStore(LEARNING_OUTBOX_STORE);
    const rawOutbox = await requestResult<LearningOutbox | undefined>(outboxStore.get(accountId));
    const outbox = readLearningOutbox(rawOutbox, accountId, record);
    const before = structuredClone(record);
    if (access) assertDeviceAccess(access);
    const value = change(record);
    store.put(parseRecord(record, accountId)!);
    const queued = queueLearningChanges(outbox, before, record);
    if (queued || rawOutbox === undefined) outboxStore.put(outbox);
    await complete;
    window.dispatchEvent(new Event("device-learning-changed"));
    if (queued || rawOutbox === undefined) window.dispatchEvent(new Event("device-learning-queued"));
    return value;
  } catch (cause) {
    try { transaction?.abort(); } catch { /* Already committed or aborted. */ }
    throw new DeviceLearningStoreError("Could not save local learning data", { cause });
  } finally {
    database.close();
  }
}

export async function writeDeviceLearningSettings(accountId: string, preferredLevel: number, settings: Partial<SessionSettings>, access: DeviceWriter): Promise<DeviceLearningRecord> {
  return mutateRecord(accountId, record => {
    record.preferredLevel = preferredLevel; record.settings = settings;
    return record;
  }, access);
}

/** Opening an unfinished stage resumes its local identity; completion links are immutable. */
export async function startDeviceRun(access: DeviceWriter, lesson: PublishedLesson, stage: number, requestedRun?: string): Promise<DeviceRun> {
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
export async function saveDeviceRun(access: DeviceWriter, run: DeviceRun, revision: number, studyDay?: string): Promise<DeviceRun> {
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

export async function hasDeviceSnapshotBackup(access: DeviceAccess): Promise<boolean> {
  assertDeviceAccess(access);
  const database = await openDatabase();
  try {
    const tx = database.transaction(SNAPSHOT_STORE, "readonly");
    const state = await requestResult<SnapshotState | undefined>(tx.objectStore(SNAPSHOT_STORE).get(access.accountId));
    assertDeviceAccess(access);
    return state !== undefined && Object.hasOwn(state, "backup");
  } finally { database.close(); }
}

async function swapSnapshot(access: DeviceAccess, replacement?: DeviceLearningRecord, signal?: AbortSignal) {
  assertDeviceAccess(access);
  signal?.throwIfAborted();
  const database = await openDatabase();
  let tx: IDBTransaction | undefined;
  const abort = () => { try { tx?.abort(); } catch { /* Already settled. */ } };
  try {
    signal?.throwIfAborted();
    tx = database.transaction([ACCOUNT_STORE, SNAPSHOT_STORE, LEARNING_OUTBOX_STORE], "readwrite", { durability: "strict" });
    signal?.addEventListener("abort", abort, { once: true });
    const complete = transactionComplete(tx);
    void complete.catch(() => {});
    const accounts = tx.objectStore(ACCOUNT_STORE), snapshots = tx.objectStore(SNAPSHOT_STORE);
    const [raw, metadata] = await Promise.all([requestResult(accounts.get(access.accountId)), requestResult<SnapshotState | undefined>(snapshots.get(access.accountId))]);
    const previous = parseRecord(raw, access.accountId);
    if (replacement === undefined && (!metadata || !Object.hasOwn(metadata, "backup"))) throw new DeviceLearningStoreError("No local recovery point exists");
    const next = replacement ?? (metadata!.backup === null ? null : parseRecord(metadata!.backup, access.accountId));
    const outboxStore = tx.objectStore(LEARNING_OUTBOX_STORE);
    const outbox = readLearningOutbox(await requestResult<LearningOutbox | undefined>(outboxStore.get(access.accountId)), access.accountId, previous);
    queueLearningChanges(outbox, previous, next);
    assertDeviceAccess(access);
    signal?.throwIfAborted();
    snapshots.put({ accountId: access.accountId, generation: crypto.randomUUID(), backup: previous } satisfies SnapshotState);
    if (next) accounts.put(next); else accounts.delete(access.accountId);
    outboxStore.put(outbox);
    await complete;
  } catch (cause) {
    try { tx?.abort(); } catch { /* Already aborted. */ }
    throw new DeviceLearningStoreError("Could not replace local learning data", { cause });
  } finally { signal?.removeEventListener("abort", abort); database.close(); }
  notifySnapshot();
  window.dispatchEvent(new Event("device-learning-queued"));
}

/** Capture and migration serialize with local saves and snapshot replacement. */
export async function captureLearningSyncBatch(access: DeviceAccess): Promise<LearningSyncBatch | null> {
  assertDeviceAccess(access);
  const database = await openDatabase();
  let tx: IDBTransaction | undefined;
  try {
    tx = database.transaction([ACCOUNT_STORE, SNAPSHOT_STORE, LEARNING_OUTBOX_STORE], "readwrite", { durability: "strict" });
    const complete = transactionComplete(tx); void complete.catch(() => {});
    const outboxes = tx.objectStore(LEARNING_OUTBOX_STORE);
    const [raw, metadata, pending] = await Promise.all([
      requestResult(tx.objectStore(ACCOUNT_STORE).get(access.accountId)),
      requestResult<SnapshotState | undefined>(tx.objectStore(SNAPSHOT_STORE).get(access.accountId)),
      requestResult<LearningOutbox | undefined>(outboxes.get(access.accountId)),
    ]);
    const outbox = readLearningOutbox(pending, access.accountId, parseRecord(raw, access.accountId));
    assertDeviceAccess(access);
    const captured = outboxRequest(outbox);
    if (pending === undefined) outboxes.put(outbox);
    await complete;
    assertDeviceAccess(access);
    return captured ? { access: { accountId: access.accountId, epoch: access.epoch }, generation: metadata?.generation ?? "legacy", ...captured } : null;
  } catch (cause) {
    try { tx?.abort(); } catch { /* Already settled. */ }
    throw cause;
  } finally { database.close(); }
}

/** Bookkeeping only: no snapshot event and no writes to active learning. */
export async function acknowledgeLearningSyncBatch(batch: LearningSyncBatch): Promise<void> {
  assertDeviceAccess(batch.access);
  const database = await openDatabase();
  let tx: IDBTransaction | undefined;
  const unsubscribe = subscribeDeviceAccess(() => {
    try { assertDeviceAccess(batch.access); } catch {
      try { tx?.abort(); } catch { /* Already settled; a committed original-account write cannot be undone. */ }
    }
  });
  try {
    tx = database.transaction([SNAPSHOT_STORE, LEARNING_OUTBOX_STORE], "readwrite", { durability: "strict" });
    const complete = transactionComplete(tx); void complete.catch(() => {});
    const store = tx.objectStore(LEARNING_OUTBOX_STORE);
    const [metadata, pending] = await Promise.all([
      requestResult<SnapshotState | undefined>(tx.objectStore(SNAPSHOT_STORE).get(batch.access.accountId)),
      requestResult<LearningOutbox | undefined>(store.get(batch.access.accountId)),
    ]);
    assertDeviceAccess(batch.access);
    if (pending && batch.generation === (metadata?.generation ?? "legacy")) {
      const outbox = readLearningOutbox(pending, batch.access.accountId, null);
      for (const [key, sequence] of Object.entries(batch.sequences)) {
        if (outbox.entries[key]?.sequence === sequence) delete outbox.entries[key];
      }
      store.put(outbox);
    }
    await complete;
  } catch (cause) {
    try { tx?.abort(); } catch { /* Already settled. */ }
    throw cause;
  } finally { unsubscribe(); database.close(); }
}

export async function replaceDeviceSnapshot(access: DeviceAccess, value: AccountSnapshot, signal?: AbortSignal): Promise<void> {
  const snapshot = parseAccountSnapshot(value, access.accountId);
  if (!snapshotHasContent(snapshot)) throw new DeviceLearningStoreError("An empty snapshot cannot replace local learning data");
  const record: DeviceLearningRecord = { ...snapshot, schemaVersion: DEVICE_LEARNING_SCHEMA_VERSION,
    runs: snapshot.runs.map(run => ({ ...run, revision: 0 })), history: snapshot.history.map(run => ({ ...run, revision: 0 })) };
  await swapSnapshot(access, record, signal);
}

export async function recoverDeviceSnapshot(access: DeviceAccess, signal?: AbortSignal): Promise<void> {
  await swapSnapshot(access, undefined, signal);
}
