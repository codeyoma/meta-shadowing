import type { LessonDraftEntry } from "./lesson-draft-parser";

export function isLessonDraftEntry(value: unknown): value is LessonDraftEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (!Number.isInteger(entry.sourceLine) || Number(entry.sourceLine) < 1) return false;

  if (entry.kind === "section") return true;
  if (entry.kind === "chapter") {
    return typeof entry.target === "string" && typeof entry.korean === "string";
  }
  return (
    entry.kind === "phrase" &&
    Number.isInteger(entry.phraseNumber) &&
    Number(entry.phraseNumber) >= 1 &&
    typeof entry.target === "string" &&
    typeof entry.korean === "string"
  );
}

export function decodeLessonDraftEntries(value: unknown): LessonDraftEntry[] | null {
  return Array.isArray(value) && value.every(isLessonDraftEntry) ? value : null;
}
