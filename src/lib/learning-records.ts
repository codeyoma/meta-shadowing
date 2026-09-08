import type { Lesson } from "./lessons";
import { isStageForLevel, stageForLevel } from "./learning-stages";
import { isSessionSettings, type SessionSettings } from "./session-settings";
import type { SessionSelection } from "./resume";
import { localStudyDay, validStudyDay } from "./study-streak";
import { isLanguage } from "./languages";

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
const JOURNAL_KEY = "meta-shadowing:learning:v1";

export function recordConfirmedPractice(now = new Date()): boolean {
  const journal = readLearningJournal();
  const day = localStudyDay(now);
  if (journal.studyDays.includes(day)) return true;
  journal.studyDays.push(day);
  journal.studyDays.sort();
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    return true;
  } catch { return false; }
}

function isProgress(value: unknown): value is ProgressRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["runId", "lessonId", "lessonVersion", "lessonName"].every(key => typeof record[key] === "string" && record[key].length > 0)
    && isLanguage(record.language)
    && typeof record.level === "number" && Number.isInteger(record.level) && record.level >= 1 && record.level <= 8
    && (record.stage === undefined || isStageForLevel(record.stage, record.level))
    && [record.nextUnit, record.nextPhrase].every(value => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999)
    && typeof record.activeMs === "number" && Number.isFinite(record.activeMs) && record.activeMs >= 0
    && isSessionSettings(record.settings);
}

function isCompletion(value: unknown): value is CompletionRecord {
  return isProgress(value) && "completedAt" in value && typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt));
}

export function readLearningJournal(): Journal {
  try {
    const value = JSON.parse(window.localStorage.getItem(JOURNAL_KEY) ?? "null");
    const history: CompletionRecord[] = Array.isArray(value?.history) ? value.history.filter(isCompletion) : [];
    // Legacy journals only have completion timestamps. Once explicit study days
    // exist, a later completion click must not earn another day of practice.
    const dates = value?.studyDays === undefined
      ? history.map(record => localStudyDay(new Date(record.completedAt)))
      : Array.isArray(value.studyDays) ? value.studyDays.filter(validStudyDay) : [];
    const studyDays = [...new Set<string>(dates)].sort();
    return { progress: isProgress(value?.progress) ? value.progress : null,
      history, studyDays };
  } catch {
    return { progress: null, history: [], studyDays: [] };
  }
}

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

export function reconcileLearningJournal(catalog: Lesson[]) {
  const journal = readLearningJournal();
  const saved = journal.progress;
  const current = saved && catalog.find(lesson => lesson.id === saved.lessonId);
  const resetLessonId = current && saved.lessonVersion !== current.version ? current.id : null;
  let storageFailed = false;
  if (resetLessonId) {
    journal.progress = null;
    try {
      // Completion history describes past work and retains its original version.
      window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    } catch { storageFailed = true; }
  }
  return { ...journal, resetLessonId, storageFailed };
}

export function saveLearningBoundary(record: ProgressRecord | CompletionRecord): boolean {
  const journal = readLearningJournal();
  if (isCompletion(record)) {
    if (!journal.history.some(item => item.runId === record.runId)) journal.history.push(record);
    if (journal.progress?.runId === record.runId) journal.progress = null;
  } else {
    // An already completed run must not resurrect progress from a stale tab.
    if (journal.history.some(item => item.runId === record.runId)) return true;
    journal.progress = record;
  }
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
    return true;
  } catch {
    return false;
  }
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
