import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";
import type { DeviceLearningRecord } from "./device-learning-store";
import { SNAPSHOT_MAX_BYTES, SnapshotError, exportAccountSnapshot, parseAccountSnapshot, snapshotHasContent, type AccountSnapshot, type SnapshotRun } from "./account-snapshot";

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type PortableRunExcludesGeneration = Expect<Equal<"generation" extends keyof SnapshotRun ? true : false, false>>;
const portableRunExcludesGeneration: PortableRunExcludesGeneration = true;

const accountId = "account-a";

function localRecord(): DeviceLearningRecord {
  const runs = Array.from({ length: 8 }, (_, index) => ({
    runId: `run-${index + 1}`,
    lessonId: `lesson-${index + 1}`,
    lessonVersion: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    lessonName: `Lesson ${index + 1}`,
    language: (["english", "japanese", "chinese", "german", "french"] as const)[index % 5],
    level: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    stage: index * 2 + 2,
    nextUnit: index + 1,
    nextPhrase: index + 2,
    activeMs: (index + 1) * 1000,
    settings: { ...DEFAULT_SESSION_SETTINGS, display: "cumulative" as const },
    confirmedCycles: index < 5 ? index + 1 : 0,
    revision: 41 + index,
  }));
  return {
    schemaVersion: 2,
    accountId,
    preferredLevel: 8,
    settings: { groupSize: 4 },
    runs,
    history: [{ ...runs[0], runId: "completed-1", completedAt: "2026-09-09T12:34:56.000Z" }],
    studyDays: ["2026-09-08", "2026-09-09"],
    credentials: "PRIVATE_SENTINEL",
    packageInventory: { audio: "PRIVATE_SENTINEL" },
    generation: "PRIVATE_SENTINEL",
  } as DeviceLearningRecord;
}

describe("portable account snapshot", () => {
  it("round-trips every level and history through an explicit private-field projection", () => {
    const snapshot = exportAccountSnapshot(localRecord());
    const encoded = JSON.stringify(snapshot);

    expect(encoded).not.toContain("PRIVATE_SENTINEL");
    expect(encoded).not.toContain("revision");
    expect(encoded).not.toContain("generation");
    expect(portableRunExcludesGeneration).toBe(true);
    expect(parseAccountSnapshot(JSON.parse(encoded), accountId)).toEqual(snapshot);
    expect(snapshot.runs).toHaveLength(8);
    expect(snapshot.runs.map(run => [run.level, run.stage, run.confirmedCycles])).toEqual([
      [1, 2, 1], [2, 4, 2], [3, 6, 3], [4, 8, 4], [5, 10, 5], [6, 12, 0], [7, 14, 0], [8, 16, 0],
    ]);
    expect(snapshot.history[0]).toMatchObject({ runId: "completed-1", confirmedCycles: 1, completedAt: "2026-09-09T12:34:56.000Z" });
    expect(() => parseAccountSnapshot(snapshot, "another-account")).toThrow();
  });

  it.each([
    ["unknown top-level field", (value: Record<string, unknown>) => { value.secret = true; }],
    ["unsupported schema", (value: Record<string, unknown>) => { value.schemaVersion = 2; }],
    ["unknown run field", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].secret = true; }],
    ["duplicate identity across active and completed runs", (value: Record<string, unknown>) => {
      (value.history as Record<string, unknown>[])[0].runId = (value.runs as Record<string, unknown>[])[0].runId;
    }],
    ["completed active run", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].completedAt = "2026-09-10T00:00:00Z"; }],
    ["completion without date", (value: Record<string, unknown>) => { delete (value.history as Record<string, unknown>[])[0].completedAt; }],
    ["incompatible stage and level", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].stage = 3; }],
    ["unknown language", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].language = "klingon"; }],
    ["unknown nested settings", (value: Record<string, unknown>) => { ((value.runs as Record<string, unknown>[])[0].settings as Record<string, unknown>).secret = true; }],
    ["invalid settings value", (value: Record<string, unknown>) => { (value.settings as Record<string, unknown>).groupSize = 9; }],
    ["invalid lesson timestamp", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].lessonVersion = "yesterday"; }],
    ["impossible lesson timestamp", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].lessonVersion = "2026-02-30T00:00:00Z"; }],
    ["invalid completion timestamp", (value: Record<string, unknown>) => { (value.history as Record<string, unknown>[])[0].completedAt = "never"; }],
    ["negative counter", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].activeMs = -1; }],
    ["unsafe counter", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].nextPhrase = Number.MAX_SAFE_INTEGER + 1; }],
    ["too many cycles", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].confirmedCycles = 6; }],
    ["cycles on a rapid level", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[5].confirmedCycles = 1; }],
    ["oversized identifier", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].runId = "x".repeat(129); }],
    ["oversized lesson identifier", (value: Record<string, unknown>) => { (value.runs as Record<string, unknown>[])[0].lessonId = "x".repeat(129); }],
    ["invalid preferred level", (value: Record<string, unknown>) => { value.preferredLevel = 0; }],
    ["invalid study day", (value: Record<string, unknown>) => { value.studyDays = ["2026-02-30"]; }],
    ["duplicate study day", (value: Record<string, unknown>) => { value.studyDays = ["2026-09-09", "2026-09-09"]; }],
  ])("rejects %s", (_name, mutate) => {
    const value = structuredClone(exportAccountSnapshot(localRecord())) as unknown as Record<string, unknown>;
    mutate(value);
    expect(() => parseAccountSnapshot(value, accountId)).toThrow(SnapshotError);
  });

  it("rejects a 129-character account identifier even when it matches the authenticated identity", () => {
    const value = exportAccountSnapshot(localRecord());
    value.accountId = "x".repeat(129);
    expect(() => parseAccountSnapshot(value, value.accountId)).toThrow(SnapshotError);
  });

  it("rejects non-JSON and payloads over the 2 MiB UTF-8 limit", () => {
    const cyclic = exportAccountSnapshot(localRecord()) as AccountSnapshot & { cycle?: unknown };
    cyclic.cycle = cyclic;
    expect(() => parseAccountSnapshot(cyclic, accountId)).toThrow(SnapshotError);

    const oversized = exportAccountSnapshot(localRecord());
    oversized.runs[0].lessonName = "한".repeat(SNAPSHOT_MAX_BYTES);
    expect(() => parseAccountSnapshot(oversized, accountId)).toThrow(SnapshotError);
  });

  it("enforces collection limits without truncating", () => {
    const active = exportAccountSnapshot(localRecord());
    active.runs = Array.from({ length: 2_001 }, (_, index) => ({ ...active.runs[0], runId: `active-${index}` }));
    expect(() => parseAccountSnapshot(active, accountId)).toThrow(SnapshotError);

    const completed = exportAccountSnapshot(localRecord());
    completed.runs = [];
    completed.history = Array.from({ length: 10_001 }, (_, index) => ({ ...completed.history[0], runId: `completed-${index}` }));
    expect(() => parseAccountSnapshot(completed, accountId)).toThrow(SnapshotError);

    const days = exportAccountSnapshot(localRecord());
    days.runs = []; days.history = [];
    days.studyDays = Array.from({ length: 36_601 }, (_, index) => new Date(Date.UTC(1900, 0, index + 1)).toISOString().slice(0, 10));
    expect(() => parseAccountSnapshot(days, accountId)).toThrow(SnapshotError);
  });

  it("treats defaults as empty while retaining nondefault settings-only snapshots", () => {
    const empty: AccountSnapshot = { schemaVersion: 1, accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] };
    expect(snapshotHasContent(empty)).toBe(false);
    expect(snapshotHasContent({ ...empty, settings: { ...DEFAULT_SESSION_SETTINGS } })).toBe(false);
    expect(snapshotHasContent({ ...empty, settings: { speed: 1.25 } })).toBe(true);
    expect(snapshotHasContent({ ...empty, preferredLevel: 2 })).toBe(true);
  });
});
