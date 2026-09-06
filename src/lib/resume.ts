const LAST_SELECTION_KEY = "meta-shadowing:last-selection";

export type SessionSelection = {
  language: "english" | "japanese";
  lessonId: string;
  level: number;
  mode: "manual" | "automatic";
  display: "current" | "cumulative";
  speed: number;
  advanceDelayMs?: number;
};

export function getPlayerHref(selection: SessionSelection): string {
  const params = new URLSearchParams({
    lesson: selection.lessonId,
    level: String(selection.level),
    mode: selection.mode,
    speed: String(selection.speed),
    gap: String((selection.advanceDelayMs ?? 1000) / 1000)
  });
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
    typeof selection.speed === "number"
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
