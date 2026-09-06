import { isGroupSize, type GroupSize } from "./phrase-groups";
import { isRapidDelay, isWpmLevel, normalizeRapidSettings, type RapidSettings } from "./rapid-session";

const LAST_SELECTION_KEY = "meta-shadowing:last-selection";

export type SessionSelection = {
  language: "english" | "japanese";
  lessonId: string;
  level: number;
  mode: "manual" | "automatic";
  display: "current" | "cumulative";
  speed: number;
  advanceDelayMs?: number;
  groupSize?: GroupSize;
  wpmLevel?: RapidSettings["wpmLevel"];
  speakingExtraMs?: number;
  lineGapMs?: number;
  sectionGapMs?: number;
  groupGapMs?: number;
  runId?: string;
};

export function getPlayerHref(selection: SessionSelection): string {
  const params = new URLSearchParams({
    lesson: selection.lessonId,
    level: String(selection.level),
    mode: selection.mode
  });
  if (selection.level >= 6) {
    const settings = normalizeRapidSettings(selection);
    params.set("display", settings.display);
    params.set("wpm", String(settings.wpmLevel));
    params.set("speak", String(settings.speakingExtraMs / 1000));
    params.set("lineGap", String(settings.lineGapMs / 1000));
    params.set("sectionGap", String(settings.sectionGapMs / 1000));
  } else {
    params.set("speed", String(selection.speed));
    params.set("gap", String((selection.advanceDelayMs ?? 1000) / 1000));
  }
  if (selection.level === 4 || selection.level === 5) params.set("group", String(selection.groupSize ?? 2));
  if (selection.groupGapMs !== undefined && selection.level <= 5) params.set("groupGap", String(selection.groupGapMs / 1000));
  if (selection.runId) params.set("run", selection.runId);
  return `/player?${params}`;
}

function isSessionSelection(value: unknown): value is SessionSelection {
  if (!value || typeof value !== "object") return false;

  const selection = value as Record<string, unknown>;
  return (
    (selection.language === "english" || selection.language === "japanese") &&
    typeof selection.lessonId === "string" &&
    typeof selection.level === "number" &&
    Number.isInteger(selection.level) &&
    selection.level >= 1 &&
    selection.level <= 8 &&
    (selection.mode === "manual" || selection.mode === "automatic") &&
    (selection.display === "current" || selection.display === "cumulative") &&
    typeof selection.speed === "number" &&
    (selection.groupSize === undefined || isGroupSize(selection.groupSize)) &&
    (selection.wpmLevel === undefined || isWpmLevel(selection.wpmLevel)) &&
    (selection.runId === undefined || typeof selection.runId === "string") &&
    ["speakingExtraMs", "lineGapMs", "sectionGapMs", "groupGapMs", "advanceDelayMs"].every(key => selection[key] === undefined || isRapidDelay(selection[key]))
  );
}

export function saveLastSelection(selection: SessionSelection): void {
  try {
    window.localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // Resume persistence is best-effort; storage may be blocked by the browser.
  }
}

export function readLastSelection(): SessionSelection | null {
  try {
    const stored = window.localStorage.getItem(LAST_SELECTION_KEY);
    if (!stored) return null;

    const selection = JSON.parse(stored) as unknown;
    return isSessionSelection(selection) ? selection : null;
  } catch {
    return null;
  }
}
