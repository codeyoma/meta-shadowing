import type { LessonDraftEntry } from "./lesson-draft-parser";
import type { Language } from "./lessons";
import { tokenizePracticeText } from "./practice-tokens";
import type { RapidLine } from "./rapid-session";

export function prepareRapidLines(entries: readonly LessonDraftEntry[], language: Language): RapidLine[] {
  const lines: RapidLine[] = [];
  let chapter: RapidLine["chapter"] = null;
  let boundary: RapidLine["boundary"] = null;
  for (const entry of entries) {
    if (entry.kind === "chapter") {
      chapter = { target: entry.target, korean: entry.korean };
      boundary = "chapter";
    } else if (entry.kind === "section") {
      if (boundary !== "chapter") boundary = "section";
    } else {
      lines.push({ target: tokenizePracticeText(entry.target, language), korean: tokenizePracticeText(entry.korean, "korean"), chapter, boundary });
      boundary = null;
    }
  }
  return lines;
}
