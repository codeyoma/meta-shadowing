// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseAccountSnapshot, type AccountSnapshot, type SnapshotRun } from "./account-snapshot";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";
import { LearningMergeError, mergeLearning, parseLearningMerge, projectLearningRun, type LearningMerge } from "./learning-merge";

const accountId = "11111111-1111-4111-8111-111111111111";
const run: SnapshotRun = { runId: "run-a", lessonId: "lesson-a", lessonVersion: "2026-09-10T00:00:00.000Z", lessonName: "Fictional lesson", language: "english", level: 4, stage: 7, nextUnit: 0, nextPhrase: 0, activeMs: 0, settings: { ...DEFAULT_SESSION_SETTINGS }, confirmedCycles: 0 };
const batchWith = (...runs: SnapshotRun[]): LearningMerge => ({ protocolVersion: 1, accountId, runs, history: [], studyDays: [] });
const snapshotWith = (...runs: SnapshotRun[]): AccountSnapshot => ({ schemaVersion: 1, accountId, preferredLevel: 1, settings: {}, runs, history: [], studyDays: [] });
const batchOf = (snapshot: AccountSnapshot): LearningMerge => ({ protocolVersion: 1, accountId, runs: snapshot.runs, history: snapshot.history, studyDays: snapshot.studyDays });

describe("learning merge", () => {
  it("unions independent runs and days, preserving old versions and cloud options", () => {
    const first = { ...snapshotWith(run), preferredLevel: 7, settings: { speed: 0.75 }, studyDays: ["2026-09-10"] };
    const incoming = { ...batchWith({ ...run, runId: "run-b", lessonVersion: "2026-08-01T00:00:00Z" }), studyDays: ["2026-09-11", "2026-09-10"] };
    const merged = mergeLearning(first, incoming);
    expect(merged.runs.map(item => item.runId)).toEqual(["run-a", "run-b"]);
    expect(merged.studyDays).toEqual(["2026-09-10", "2026-09-11"]);
    expect(merged).toMatchObject({ preferredLevel: 7, settings: { speed: 0.75 } });
  });
  it("selects a coherent farther checkpoint while maximizing time separately", () => {
    const older = { ...run, nextPhrase: 1, activeMs: 9000 };
    const newer = { ...run, nextPhrase: 8, nextUnit: 4, activeMs: 4000 };
    expect(mergeLearning(snapshotWith(older), batchWith(newer)).runs[0]).toMatchObject({ nextPhrase: 8, nextUnit: 4, activeMs: 9000 });
  });
  it("compares canonical settings before cycles and group indexes", () => {
    const small = { ...run, nextPhrase: 8, nextUnit: 4, confirmedCycles: 5, settings: { ...run.settings, groupSize: 2 as const } };
    const large = { ...run, nextPhrase: 8, nextUnit: 1, confirmedCycles: 0, settings: { ...run.settings, groupSize: 4 as const } };
    expect(mergeLearning(snapshotWith(small), batchWith(large)).runs[0]).toEqual(large);
    expect(mergeLearning(snapshotWith(large), batchWith({ ...large, confirmedCycles: 2 })).runs[0].confirmedCycles).toBe(2);
  });
  it("completion dominates late active copies; earliest normalized time wins with a stable tie-break", () => {
    const completion = { ...run, completedAt: "2026-09-11T09:00:00+09:00", lessonName: "A" };
    const first = mergeLearning(snapshotWith({ ...run, activeMs: 9000 }), { ...batchWith(), history: [completion] });
    const merged = mergeLearning(first, { ...batchWith({ ...run, nextPhrase: 99 }), history: [] });
    expect(merged.runs).toEqual([]);
    expect(merged.history).toEqual([{ ...completion, completedAt: "2026-09-11T00:00:00.000Z", activeMs: 9000 }]);
    expect(mergeLearning(first, { ...batchWith(), history: [{ ...completion, lessonName: "Z", completedAt: "2026-09-11T00:00:00Z" }] }).history[0].lessonName).toBe("A");
  });
  it("is idempotent, commutative and associative across permutations including completion", () => {
    const batches = [batchWith({ ...run, nextPhrase: 2, activeMs: 9 }), batchWith({ ...run, nextPhrase: 9, activeMs: 2 }), { ...batchWith({ ...run, runId: "run-b" }), history: [{ ...run, completedAt: "2026-09-11T01:00:00Z" }] }];
    const expected = batches.reduce<AccountSnapshot | null>(mergeLearning, null)!;
    for (const order of [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      expect(order.map(index => batches[index]).reduce<AccountSnapshot | null>(mergeLearning, null)).toEqual(expected);
    }
    expect(mergeLearning(expected, batchOf(expected))).toEqual(expected);
    const combined = mergeLearning(mergeLearning(null, batches[1]), batches[2]);
    expect(mergeLearning(mergeLearning(null, batches[0]), batchOf(combined))).toEqual(expected);
  });
  it.each(["lessonId", "lessonVersion", "language", "level", "stage"] as const)("rejects incompatible immutable %s without mutating inputs", key => {
    const values = { lessonId: "other", lessonVersion: "2025-01-01T00:00:00Z", language: "japanese", level: 5, stage: 8 };
    const incoming = { ...run, [key]: values[key], ...(key === "level" ? { stage: 9 } : {}) } as SnapshotRun;
    const saved = snapshotWith(run);
    expect(() => mergeLearning(saved, batchWith(incoming))).toThrow(LearningMergeError);
    expect(saved).toEqual(snapshotWith(run));
  });
  it("rejects merged count and byte overflow without truncation", () => {
    const saved = snapshotWith(...Array.from({ length: 2000 }, (_, i) => ({ ...run, runId: `old-${i}` })));
    expect(() => mergeLearning(saved, batchWith(run))).toThrowError(expect.objectContaining({ code: "merge-limit" }));
    expect(() => mergeLearning(snapshotWith({ ...run, lessonName: "x".repeat(1100000) }), batchWith({ ...run, runId: "b", lessonName: "y".repeat(1100000) }))).toThrowError(expect.objectContaining({ code: "merge-limit" }));
  });
  it("rejects malformed stored state instead of silently resetting it", () => {
    expect(() => mergeLearning({ ...snapshotWith(), arbitrary: true } as AccountSnapshot, batchWith(run))).toThrow();
  });
});

describe("strict merge protocol and safe projection", () => {
  it("keeps the snapshot parser strict while accepting a separately versioned batch", () => {
    expect(parseLearningMerge(batchWith(run), accountId)).toEqual(batchWith(run));
    expect(() => parseAccountSnapshot(batchWith(run), accountId)).toThrow();
    expect(() => parseLearningMerge(snapshotWith(), accountId)).toThrowError(expect.objectContaining({ code: "client-update-required" }));
    expect(() => parseLearningMerge({ ...batchWith(), protocolVersion: 2 }, accountId)).toThrowError(expect.objectContaining({ code: "client-update-required" }));
    expect(() => parseLearningMerge(batchWith(), "other")).toThrowError(expect.objectContaining({ code: "account-changed" }));
  });
  it.each([
    () => ({ ...batchWith(), token: "fictional" }),
    () => batchWith({ ...run, localWriter: "fictional" } as SnapshotRun),
    () => batchWith({ ...run, settings: { ...run.settings, token: "fictional" } } as SnapshotRun),
    () => ({ ...batchWith(), history: [{ ...run, completedAt: "2026-09-11T00:00:00Z", secret: true }] }),
    () => ({ ...batchWith(), options: { expectedRevision: 0, preferredLevel: 1, settings: {}, secret: true } }),
    () => ({ ...batchWith(), options: { expectedRevision: 0, preferredLevel: 1, settings: { secret: true } } }),
  ])("rejects extra fields at every nesting level", make => {
    expect(() => parseLearningMerge(make(), accountId)).toThrowError(expect.objectContaining({ code: "invalid-merge" }));
  });
  it("requires all fields, valid revisions and unique records and days within each batch", () => {
    expect(() => parseLearningMerge({ protocolVersion: 1, accountId }, accountId)).toThrow();
    expect(() => parseLearningMerge(batchWith(run, run), accountId)).toThrow();
    expect(() => parseLearningMerge({ ...batchWith(), studyDays: ["2026-09-11", "2026-09-11"] }, accountId)).toThrow();
    expect(() => parseLearningMerge({ ...batchWith(), options: { expectedRevision: -1, preferredLevel: 1, settings: {} } }, accountId)).toThrow();
  });
  it("classifies a batch whose portable snapshot exceeds the byte limit as capacity, not invalid data", () => {
    const value = batchWith({ ...run, lessonName: "" });
    value.runs[0].lessonName = "x".repeat(2 * 1024 * 1024 - new TextEncoder().encode(JSON.stringify(value)).byteLength);
    expect(() => parseLearningMerge(value, accountId)).toThrowError(expect.objectContaining({ code: "merge-limit" }));
  });
  it("projects only portable run and setting fields before validation", () => {
    expect(projectLearningRun({ ...run, writerToken: "fictional", settings: { ...run.settings, extra: "fictional" } })).toEqual(run);
  });
});
