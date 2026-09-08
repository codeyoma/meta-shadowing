import { describe, expect, it } from "vitest";
import { completionHistoryForLesson, type CompletionRecord } from "./learning-records";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";

const record = (runId: string, completedAt: string, lessonId = "one", lessonVersion = "v2"): CompletionRecord => ({
  runId, completedAt, lessonId, lessonVersion, lessonName: "Same title", language: "english",
  level: 1, stage: 1, nextUnit: 3, nextPhrase: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
});

describe("completionHistoryForLesson", () => {
  it("filters by lesson ID, retains past versions, and orders actual timestamps newest first without mutation", () => {
    const history = Object.freeze([
      record("old-version", "2026-09-08T10:00:00+09:00", "one", "v1"),
      record("other-lesson", "2026-09-09T00:00:00Z", "two"),
      record("newest", "2026-09-08T02:00:00Z"),
    ]);
    expect(completionHistoryForLesson(history, "one").map(item => item.runId)).toEqual(["newest", "old-version"]);
    expect(history.map(item => item.runId)).toEqual(["old-version", "other-lesson", "newest"]);
  });

  it("returns an empty list for no history or no matching lesson", () => {
    expect(completionHistoryForLesson([], "one")).toEqual([]);
    expect(completionHistoryForLesson([record("other", "2026-09-08T00:00:00Z", "two")], "one")).toEqual([]);
  });
});
