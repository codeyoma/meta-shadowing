import type { LessonDraftEntry } from "./lesson-draft-parser";

type SentenceSection = {
  id: string;
  heading: Extract<LessonDraftEntry, { kind: "chapter" }> | null;
  entries: Exclude<LessonDraftEntry, { kind: "chapter" }>[];
};

/** Blank separators stay inside a titled section; introductory text stays untitled. */
export function lessonSentenceSections(entries: LessonDraftEntry[]): SentenceSection[] {
  const sections: SentenceSection[] = [];
  let current: SentenceSection | undefined;
  entries.forEach((entry, index) => {
    if (entry.kind === "chapter") {
      current = { id: `section-${index}`, heading: entry, entries: [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { id: "untitled", heading: null, entries: [] };
        sections.push(current);
      }
      current.entries.push(entry);
    }
  });
  return sections;
}

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
