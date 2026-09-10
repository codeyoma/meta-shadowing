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

it("filters obsolete local runs before deterministic stage ordering, preserving explicit-stage checkpoints", () => {
  const first = { ...progress, runId: "first", level: 1, stage: 1 };
  const second = { ...first, runId: "second", stage: 2, nextPhrase: 2, nextUnit: 2 };
  const journal = { progress: null, history: [], localProgress: [{ ...first, lessonVersion: "old" }, second, first] };
  expect(nextPracticeForLesson(journal, lesson)).toEqual({ stage: 1, progress: first, review: false });
  expect(nextPracticeForLesson(journal, lesson, 2)).toEqual({ stage: 2, progress: second, review: false });
});

it("keeps eligible legacy resume priority without removing local stages from explicit selection", () => {
  const local = { ...progress, runId: "local", level: 1, stage: 2 };
  const journal = { progress, history: [], localProgress: [local] };
  expect(nextPracticeForLesson(journal, lesson)).toEqual({ stage: 8, progress, review: false });
  expect(nextPracticeForLesson(journal, lesson, 2)).toEqual({ stage: 2, progress: local, review: false });
  expect(nextPracticeForLesson(journal, lesson, 1)).toEqual({ stage: 1, progress: null, review: false });
});

it("uses stable run identity to break same-stage ties regardless of insertion order", () => {
  const a = { ...progress, runId: "a", level: 1, stage: 1 }, z = { ...a, runId: "z" };
  expect(nextPracticeForLesson({ progress: null, history: [], localProgress: [z, a] }, lesson).progress).toEqual(a);
});
