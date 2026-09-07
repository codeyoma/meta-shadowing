import { expect, it } from "vitest";
import { completedStagesForLesson, type CompletionRecord } from "./learning-records";
import { lessons } from "./lessons";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";

const lesson = lessons[0];
const completion: CompletionRecord = {
  runId: "completed-run", lessonId: lesson.id, lessonVersion: lesson.version,
  lessonName: lesson.name, language: lesson.language, level: 4, stage: 8,
  nextUnit: 3, nextPhrase: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
  completedAt: "2026-09-07T00:00:00.000Z"
};

it("counts completed stages once, without counting replays or the other repetition", () => {
  expect(completedStagesForLesson([completion, { ...completion, runId: "replay" }], lesson)).toEqual([8]);
  expect(completedStagesForLesson([completion, { ...completion, stage: 7 }], lesson)).toEqual([7, 8]);
});

it("excludes completion history from another lesson or content version", () => {
  expect(completedStagesForLesson([
    { ...completion, lessonId: "another-book" },
    { ...completion, lessonVersion: "old-version" }
  ], lesson)).toEqual([]);
});

it("maps legacy level completions only to their first stage and starts empty at zero", () => {
  expect(completedStagesForLesson([{ ...completion, stage: undefined }], lesson)).toEqual([7]);
  expect(completedStagesForLesson([], lesson)).toEqual([]);
});
