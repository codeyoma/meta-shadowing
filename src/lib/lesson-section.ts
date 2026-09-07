import type { LessonDraftEntry } from "./lesson-draft-parser";

export type LessonSection = {
  chapter: { target: string; korean: string } | null;
  startsSection: boolean;
};

/** Resolve script headings without counting title or separator rows as phrases. */
export function lessonSectionAt(entries: LessonDraftEntry[], phraseNumber: number): LessonSection {
  let chapter: LessonSection["chapter"] = null;
  let startsSection = false;
  for (const entry of entries) {
    if (entry.kind === "chapter") {
      chapter = { target: entry.target, korean: entry.korean };
      startsSection = false;
    } else if (entry.kind === "section") {
      startsSection = true;
    } else {
      if (entry.phraseNumber === phraseNumber) return { chapter, startsSection };
      startsSection = false;
    }
  }
  return { chapter: null, startsSection: false };
}
