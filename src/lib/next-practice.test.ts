import { expect, it } from "vitest";
import { nextPracticeForLesson } from "./next-practice";
import { lessons } from "./lessons";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";
import type { CompletionRecord, ProgressRecord } from "./learning-records";

const lesson = lessons[0];
const progress: ProgressRecord = { runId: "resume-run", lessonId: lesson.id, lessonVersion: lesson.version,
  lessonName: lesson.name, language: lesson.language, level: 4, stage: 8, nextUnit: 1, nextPhrase: 1,
  activeMs: 1500, settings: { ...DEFAULT_SESSION_SETTINGS, speed: 1.5 } };
const complete = (stage: number): CompletionRecord => ({ ...progress, runId: `done-${stage}`,
  level: Math.ceil(stage / 2), stage, completedAt: "2026-09-07T00:00:00Z" });

it("resumes the matching unfinished run with its saved settings, not a previewed stage", () => {
  expect(nextPracticeForLesson({ progress, history: [] }, lesson)).toEqual({ stage: 8, progress, review: false });
});

it("selects the first missing stage, counting only this lesson version's completions", () => {
  expect(nextPracticeForLesson({ progress: null, history: [complete(1), complete(1), complete(3),
    { ...complete(2), lessonVersion: "old" }, { ...complete(2), lessonId: "other" }] }, lesson))
    .toEqual({ stage: 2, progress: null, review: false });
});

it.each([
  { ...progress, lessonId: "other" }, { ...progress, lessonVersion: "old" },
  { ...progress, nextPhrase: lesson.phraseCount }, { ...progress, runId: "done-1" }
])("does not resume obsolete, finished, or unrelated progress", saved => {
  expect(nextPracticeForLesson({ progress: saved, history: [complete(1)] }, lesson))
    .toEqual({ stage: 2, progress: null, review: false });
});

it("offers a real first-stage review once all 16 stages are complete", () => {
  expect(nextPracticeForLesson({ progress: null, history: Array.from({ length: 16 }, (_, i) => complete(i + 1)) }, lesson))
    .toEqual({ stage: 1, progress: null, review: true });
});
