import type { Lesson } from "./lessons";
import { isSessionSettings, type SessionSettings } from "./session-settings";
import type { SessionSelection } from "./resume";

export type RunSelection = SessionSelection & SessionSettings & { runId: string };
export type ProgressRecord = {
  runId: string;
  lessonId: string;
  lessonVersion: string;
  lessonName: string;
  language: Lesson["language"];
  level: number;
  // Zero-based next group in levels 4–5, otherwise the next phrase/line.
  nextUnit: number;
  nextPhrase: number;
  activeMs: number;
  settings: SessionSettings;
};
export type CompletionRecord = ProgressRecord & { completedAt: string };
type Journal = { progress: ProgressRecord | null; history: CompletionRecord[] };
const JOURNAL_KEY = "meta-shadowing:learning:v1";

function isProgress(value: unknown): value is ProgressRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["runId", "lessonId", "lessonVersion", "lessonName"].every(key => typeof record[key] === "string" && record[key].length > 0)
    && (record.language === "english" || record.language === "japanese")
    && typeof record.level === "number" && Number.isInteger(record.level) && record.level >= 1 && record.level <= 8
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
    return { progress: isProgress(value?.progress) ? value.progress : null,
      history: Array.isArray(value?.history) ? value.history.filter(isCompletion) : [] };
  } catch {
    return { progress: null, history: [] };
  }
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
    && (selection.level !== 4 && selection.level !== 5 || record.settings.groupSize === selection.groupSize);
}

export function formatActiveTime(milliseconds: number): string {
  return milliseconds < 60000 ? `${(milliseconds / 1000).toFixed(1)}초` : `${Math.floor(milliseconds / 60000)}분 ${Math.floor(milliseconds / 1000) % 60}초`;
}
