import { beforeEach, describe, expect, it } from "vitest";
import { getPlayerHref, readLastSelection, saveLastSelection } from "./resume";
import { matchesRun, readLearningJournal, saveLearningBoundary } from "./learning-records";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";
import { lessons } from "./lessons";

const lesson = lessons[0];
const selection = { ...DEFAULT_SESSION_SETTINGS, language: lesson.language, lessonId: lesson.id, level: 4, runId: "stage-run" };
const record = { runId: selection.runId, lessonId: lesson.id, lessonVersion: lesson.version, lessonName: lesson.name,
  language: lesson.language, level: 4, nextUnit: 1, nextPhrase: 2, activeMs: 2000, settings: DEFAULT_SESSION_SETTINGS };

describe("stage identity with eight unchanged playback levels", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    } });
  });

  it.each([[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [8, 4],
    [9, 5], [10, 5], [11, 6], [12, 6], [13, 7], [14, 7], [15, 8], [16, 8]])(
    "stage %i links to level %i without losing its repetition", (stage, level) => {
      const chosen = { ...selection, stage, level };
      saveLastSelection(chosen);
      const params = new URL(getPlayerHref(readLastSelection()!), "http://localhost").searchParams;
      expect(params.get("level")).toBe(String(level));
      expect(params.get("stage")).toBe(String(stage));
    });

  it("legacy progress resumes only the first stage of its original level", () => {
    saveLearningBoundary(record);
    expect(readLearningJournal().progress).toEqual(record);
    expect(matchesRun(record, lesson, { ...selection, stage: 7 })).toBe(true);
    expect(matchesRun(record, lesson, { ...selection, stage: 8 })).toBe(false);
  });

  it("second-stage progress cannot resume the first stage with the same run id", () => {
    const second = { ...record, stage: 8 };
    saveLearningBoundary(second);
    expect(readLearningJournal().progress).toEqual(second);
    expect(matchesRun(second, lesson, { ...selection, stage: 8 })).toBe(true);
    expect(matchesRun(second, lesson, { ...selection, stage: 7 })).toBe(false);
  });

  it.each([0, 17, 4, 8.5, "8", null])("rejects invalid or mismatched saved stage %j", stage => {
    window.localStorage.setItem("meta-shadowing:last-selection", JSON.stringify({ ...selection, stage }));
    window.localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ progress: { ...record, stage }, history: [] }));
    expect(readLastSelection()).toBeNull();
    expect(readLearningJournal().progress).toBeNull();
  });

  it("retains completion history for both repetitions independently", () => {
    const first = { ...record, stage: 7, runId: "first-run", completedAt: "2026-09-07T10:00:00.000Z" };
    const second = { ...record, stage: 8, runId: "second-run", completedAt: "2026-09-07T11:00:00.000Z" };
    saveLearningBoundary(first);
    saveLearningBoundary(second);
    saveLearningBoundary(second);
    expect(readLearningJournal().history).toEqual([first, second]);
  });
});
