import type { Lesson } from "./lessons";
import { stageForLevel } from "./learning-stages";
import { type SessionSettings } from "./session-settings";
import type { SessionSelection } from "./resume";

export type RunSelection = SessionSelection & SessionSettings & { runId: string };
export type ProgressRecord = {
  runId: string;
  lessonId: string;
  lessonVersion: string;
  lessonName: string;
  language: Lesson["language"];
  level: number;
  stage?: number;
  // Zero-based next group in levels 4–5, otherwise the next phrase/line.
  nextUnit: number;
  nextPhrase: number;
  activeMs: number;
  settings: SessionSettings;
};
export type CompletionRecord = ProgressRecord & { completedAt: string };
export type Journal = { progress: ProgressRecord | null; history: CompletionRecord[]; studyDays: string[] };
export function completedStagesForLesson(history: CompletionRecord[], lesson: Lesson): number[] {
  return [...new Set(history
    .filter(record => record.lessonId === lesson.id && record.lessonVersion === lesson.version)
    .map(record => stageForLevel(record.level, record.stage)))].sort((a, b) => a - b);
}

// History describes past work, so unlike stage progress it includes all versions.
export function completionHistoryForLesson(history: readonly CompletionRecord[], lessonId: string): CompletionRecord[] {
  return history.filter(record => record.lessonId === lessonId)
    .toSorted((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}

export function matchesRun(record: ProgressRecord, lesson: Lesson, selection: RunSelection): boolean {
  return record.runId === selection.runId && record.lessonId === lesson.id && record.lessonVersion === lesson.version
    && record.level === selection.level
    && stageForLevel(record.level, record.stage) === stageForLevel(selection.level, selection.stage)
    && (selection.level !== 4 && selection.level !== 5 || record.settings.groupSize === selection.groupSize);
}

export function formatActiveTime(milliseconds: number): string {
  return milliseconds < 60000 ? `${(milliseconds / 1000).toFixed(1)}초` : `${Math.floor(milliseconds / 60000)}분 ${Math.floor(milliseconds / 1000) % 60}초`;
}
