// @vitest-environment node
import { describe, expect, it } from "vitest";
import { outboxRequest, queueLearningChanges, readLearningOutbox, type LearningOutbox } from "./device-learning-outbox";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";

const run = { runId: "fictional-run", lessonId: "fictional-lesson", lessonVersion: "2026-09-10T00:00:00Z", lessonName: "Fictional lesson", language: "english", level: 1, stage: 1, nextUnit: 0, nextPhrase: 0, activeMs: 0, confirmedCycles: 0, settings: { ...DEFAULT_SESSION_SETTINGS }, revision: 0 };
const record = { runs: [run], history: [], studyDays: ["2026-09-11"] };
describe("portable learning outbox values", () => {
  it("projects migration values and does not queue a local-revision-only write", () => {
    const outbox = readLearningOutbox(undefined, "fictional-a", record);
    const first = outboxRequest(outbox)!;
    expect(first.request.studyDays).toEqual(["2026-09-11"]);
    expect(first.request.runs[0]).not.toHaveProperty("revision");
    expect(first.request).not.toHaveProperty("options");
    expect(queueLearningChanges(outbox, record, { ...record, runs: [{ ...run, revision: 1 }] })).toBe(false);
    expect(outboxRequest(outbox)?.sequences).toEqual(first.sequences);
  });
  it("keeps an unsent farther checkpoint and its maximum active time through a rewind", () => {
    const farther = { ...record, runs: [{ ...run, nextPhrase: 9, nextUnit: 9, activeMs: 100 }] };
    const outbox = readLearningOutbox(undefined, "fictional-a", farther);
    queueLearningChanges(outbox, farther, { ...record, runs: [{ ...run, nextPhrase: 1, nextUnit: 1, activeMs: 200 }] });
    expect(outboxRequest(outbox)?.request.runs[0]).toMatchObject({ nextPhrase: 9, nextUnit: 9, activeMs: 200 });
  });
  it("retains an empty migration marker without reseeding acknowledged records", () => {
    const outbox: LearningOutbox = { accountId: "fictional-a", sequence: 50, entries: {} };
    expect(outboxRequest(readLearningOutbox(outbox, "fictional-a", record))).toBeNull();
  });
  it.each([
    { accountId: "fictional-b", sequence: 0, entries: {} },
    { accountId: "fictional-a", sequence: -1, entries: {} },
    { accountId: "fictional-a", sequence: 1, entries: { "day:2026-09-11": { kind: "day", sequence: 2, value: "2026-09-11" } } },
    { accountId: "fictional-a", sequence: 1, entries: { "day:invalid": { kind: "day", sequence: 1, value: "invalid" } } },
  ])("classifies corrupted queue metadata as actionable invalid data", value => {
    expect(() => readLearningOutbox(value as LearningOutbox, "fictional-a", null)).toThrowError(expect.objectContaining({ code: "invalid-merge" }));
  });
  it("bounds capture even when the pending queue exceeds the server's total-run limit", () => {
    const outbox = readLearningOutbox(undefined, "fictional-a", { runs: Array.from({ length: 2100 }, (_, i) => ({ ...run, runId: `fictional-${i}` })), history: [], studyDays: [] });
    const batch = outboxRequest(outbox)!;
    expect(batch.request.runs).toHaveLength(256);
    expect(Object.keys(outbox.entries)).toHaveLength(2100);
    expect(Object.keys(batch.sequences)).toHaveLength(256);
  });
});
