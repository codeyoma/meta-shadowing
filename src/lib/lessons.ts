import type { LessonDraftEntry } from "./lesson-draft-parser";

export type Language = "english" | "japanese";

export type Lesson = {
  id: string;
  language: Language;
  name: string;
  localizedName: string;
  phraseCount: number;
};

export type LessonPhrase = Extract<LessonDraftEntry, { kind: "phrase" }>;

export type PublishedLesson = Lesson & {
  entries: LessonDraftEntry[];
  phrases: LessonPhrase[];
};

export const lessons: Lesson[] = [
  {
    id: "morning-routine",
    language: "english",
    name: "Morning Routine",
    localizedName: "아침 일과",
    phraseCount: 24
  },
  {
    id: "daily-conversation",
    language: "english",
    name: "Daily Conversation",
    localizedName: "일상 회화",
    phraseCount: 18
  },
  {
    id: "tokyo-walk",
    language: "japanese",
    name: "東京の散歩",
    localizedName: "도쿄 산책",
    phraseCount: 20
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
