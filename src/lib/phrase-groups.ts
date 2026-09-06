import type { LessonDraftEntry } from "./lesson-draft-parser";
import type { LessonPhrase } from "./lessons";

export type GroupSize = 2 | 3 | 4;
export type PhraseGroup = {
  phrases: LessonPhrase[];
  chapter: { target: string; korean: string } | null;
  startsSection: boolean;
};

export function groupLessonPhrases(entries: LessonDraftEntry[], size: GroupSize): PhraseGroup[] {
  const groups: PhraseGroup[] = [];
  let phrases: LessonPhrase[] = [];
  let chapter: PhraseGroup["chapter"] = null;
  let startsSection = false;
  function finishSection() {
    for (let index = 0; index < phrases.length; index += size) {
      const remaining = phrases.slice(index, index + size);
      if (index > 0 && remaining.length <= size / 2) groups.at(-1)!.phrases.push(...remaining);
      else groups.push({ phrases: remaining, chapter, startsSection: index === 0 && startsSection });
    }
    phrases = [];
  }
  for (const entry of entries) {
    if (entry.kind === "phrase") phrases.push(entry);
    else {
      finishSection();
      startsSection = entry.kind === "section";
      if (entry.kind === "chapter") chapter = { target: entry.target, korean: entry.korean };
    }
  }
  finishSection();
  return groups;
}
