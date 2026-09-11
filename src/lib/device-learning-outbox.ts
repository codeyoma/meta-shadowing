import type { AccountSnapshot, SnapshotRun, SnapshotCompletion } from "./account-snapshot";
import { LearningMergeError, mergeLearning, parseLearningMerge, projectLearningRun, type LearningMerge } from "./learning-merge";
import { validStudyDay } from "./study-streak";

export const LEARNING_OUTBOX_STORE = "learning-outbox";
type QueuedValue = { kind: "run"; value: SnapshotRun | SnapshotCompletion } | { kind: "day"; value: string };
type Entry = QueuedValue & { sequence: number };
export type LearningOutbox = { accountId: string; sequence: number; entries: Record<string, Entry> };
type LearningValues = { runs: unknown[]; history: unknown[]; studyDays: string[] };

function values(record: LearningValues | null): Map<string, QueuedValue> {
  const entries = new Map<string, QueuedValue>();
  for (const run of [...(record?.runs ?? []), ...(record?.history ?? [])]) {
    const value = projectLearningRun(run);
    entries.set(`run:${value.runId}`, { kind: "run", value });
  }
  for (const day of record?.studyDays ?? []) entries.set(`day:${day}`, { kind: "day", value: day });
  return entries;
}

/** An absent row is the per-account migration marker. Never reseed an ACKed row. */
export function readLearningOutbox(raw: LearningOutbox | undefined, accountId: string, existing: LearningValues | null): LearningOutbox {
  if (raw === undefined) {
    const outbox: LearningOutbox = { accountId, sequence: 0, entries: {} };
    queueLearningChanges(outbox, null, existing);
    return outbox;
  }
  if (!raw || raw.accountId !== accountId || !Number.isSafeInteger(raw.sequence) || raw.sequence < 0
    || !raw.entries || typeof raw.entries !== "object" || Array.isArray(raw.entries)) throw new LearningMergeError("invalid-merge");
  for (const [key, entry] of Object.entries(raw.entries)) {
    if (!entry || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || entry.sequence > raw.sequence) throw new LearningMergeError("invalid-merge");
    if (entry.kind === "day") {
      if (!validStudyDay(entry.value) || key !== `day:${entry.value}`) throw new LearningMergeError("invalid-merge");
    } else if (entry.kind === "run") {
      const parsed = projectLearningRun(entry.value);
      if (key !== `run:${parsed.runId}` || JSON.stringify(parsed) !== JSON.stringify(entry.value)) throw new LearningMergeError("invalid-merge");
    } else throw new LearningMergeError("invalid-merge");
  }
  return raw;
}

/** Coalesce portable values, retaining unsent farther checkpoints across local rewinds. */
export function queueLearningChanges(outbox: LearningOutbox, before: LearningValues | null, after: LearningValues | null): boolean {
  const previous = values(before);
  let changed = false;
  for (const [key, entry] of values(after)) {
    if (JSON.stringify(previous.get(key)) === JSON.stringify(entry)) continue;
    let next = entry;
    const pending = outbox.entries[key];
    if (entry.kind === "run" && pending?.kind === "run") {
      const saved: AccountSnapshot = { schemaVersion: 1, accountId: outbox.accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] };
      if ("completedAt" in pending.value) saved.history.push(pending.value); else saved.runs.push(pending.value);
      const incoming = entry.value;
      const merged = mergeLearning(saved, { protocolVersion: 1, accountId: outbox.accountId, runs: "completedAt" in incoming ? [] : [incoming], history: "completedAt" in incoming ? [incoming] : [], studyDays: [] });
      next = { kind: "run", value: merged.runs[0] ?? merged.history[0] };
    }
    if (!Number.isSafeInteger(outbox.sequence + 1)) throw new LearningMergeError("merge-limit");
    outbox.entries[key] = { ...next, sequence: ++outbox.sequence };
    changed = true;
  }
  return changed;
}

export function outboxRequest(outbox: LearningOutbox): { request: LearningMerge; sequences: Record<string, number> } | null {
  const request: LearningMerge = { protocolVersion: 1, accountId: outbox.accountId, runs: [], history: [], studyDays: [] };
  const sequences: Record<string, number> = {};
  let bytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  let count = 0;
  for (const [key, entry] of Object.entries(outbox.entries)) {
    const entryBytes = new TextEncoder().encode(JSON.stringify(entry.value)).byteLength + 1;
    // A single larger valid value can still travel alone under the protocol limit.
    if (count && (bytes + entryBytes > 256 * 1024 || count >= 256)) break;
    if (entry.kind === "day") request.studyDays.push(entry.value);
    else if ("completedAt" in entry.value) request.history.push(entry.value);
    else request.runs.push(entry.value);
    sequences[key] = entry.sequence;
    bytes += entryBytes; count++;
  }
  return Object.keys(sequences).length ? { request: parseLearningMerge(request, outbox.accountId), sequences } : null;
}
