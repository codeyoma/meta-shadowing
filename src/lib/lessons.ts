import type { LessonDraftEntry } from "./lesson-draft-parser";

export type Language = "english" | "japanese";

export type Lesson = {
  id: string;
  version: string;
  language: Language;
  name: string;
  localizedName: string;
  phraseCount: number;
  /** Titled script sections, stored as chapter_count (not blank separators). */
  sectionCount: number;
};

export type LessonPhrase = Extract<LessonDraftEntry, { kind: "phrase" }>;

export type PublishedLesson = Lesson & {
  entries: LessonDraftEntry[];
  phrases: LessonPhrase[];
};

export const lessons: Lesson[] = [
  {
    id: "morning-routine",
    version: "fixture-v1",
    language: "english",
    name: "Morning Routine",
    localizedName: "아침 일과",
    phraseCount: 24,
    sectionCount: 0
  },
  {
    id: "daily-conversation",
    version: "fixture-v1",
    language: "english",
    name: "Daily Conversation",
    localizedName: "일상 회화",
    phraseCount: 18,
    sectionCount: 2
  },
  {
    id: "tokyo-walk",
    version: "fixture-v1",
    language: "japanese",
    name: "東京の散歩",
    localizedName: "도쿄 산책",
    phraseCount: 20,
    sectionCount: 0
  }
];

export const levelNames = [
  "자막 쉐도잉",
  "순간 암기",
  "첫 단어 힌트",
  "다문장 암기",
  "다문장 첫 단어",
  "속사포 영한",
  "속사포 한영",
  "속사포 한글"
];

export function getLesson(id: string | null, catalog: Lesson[] = lessons): Lesson | undefined {
  return catalog.find((lesson) => lesson.id === id);
}
