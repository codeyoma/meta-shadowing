import { beforeEach, expect, it } from "vitest";
import { readLearningJournal, recordConfirmedPractice, saveLearningBoundary } from "./learning-records";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";

beforeEach(() => localStorage.clear());
it("records confirmed practice once per local day without replacing the saved run", () => {
  const progress = { runId: "run", lessonId: "lesson", lessonVersion: "v1", lessonName: "Lesson", language: "english" as const,
    level: 1, stage: 1, nextUnit: 0, nextPhrase: 0, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS };
  saveLearningBoundary(progress);
  recordConfirmedPractice(new Date(2026, 8, 6, 23));
  recordConfirmedPractice(new Date(2026, 8, 7, 1));
  recordConfirmedPractice(new Date(2026, 8, 7, 12));
  expect(readLearningJournal()).toMatchObject({ progress, studyDays: ["2026-09-06", "2026-09-07"] });
});

it("retains valid legacy completion dates but invents no dates for partial sessions", () => {
  const record = { runId: "run", lessonId: "lesson", lessonVersion: "v1", lessonName: "Lesson", language: "english",
    level: 1, stage: 1, nextUnit: 1, nextPhrase: 1, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS };
  localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ progress: record, history: [
    { ...record, runId: "done", completedAt: new Date(2026, 8, 5, 12).toISOString() }
  ] }));
  expect(readLearningJournal().studyDays).toEqual(["2026-09-05"]);
});

it("does not award a second day when the completion button is pressed after midnight", () => {
  const record = { runId: "run", lessonId: "lesson", lessonVersion: "v1", lessonName: "Lesson", language: "english" as const,
    level: 1, stage: 1, nextUnit: 1, nextPhrase: 1, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS };
  recordConfirmedPractice(new Date(2026, 8, 6, 23, 59));
  saveLearningBoundary({ ...record, completedAt: new Date(2026, 8, 7, 0, 1).toISOString() });
  expect(readLearningJournal().studyDays).toEqual(["2026-09-06"]);
});

it("validates explicit study dates without substituting completion timestamps", () => {
  localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ progress: null, history: [], studyDays: ["bad", null, "2026-02-30", "2026-09-06"] }));
  expect(readLearningJournal().studyDays).toEqual(["2026-09-06"]);
});
