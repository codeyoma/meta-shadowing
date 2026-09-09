import "server-only";

import { decodeLessonDraftEntries } from "./lesson-entry-decoder";
import { parseLessonDraft } from "./lesson-draft-parser";
import { lessons, type Language, type Lesson, type LessonPhrase, type PublishedLesson } from "./lessons";
import { isLanguage } from "./languages";
import { LESSON_AUDIO_BUCKET } from "./lesson-audio";
import type { PublishedAudioItem } from "./lesson-publication";
import { createSecretSupabaseClient } from "./supabase/secret";

type PublishedLessonRow = {
  id: string;
  lesson_id: string;
  title: string;
  language: string;
  phrase_count: number;
  chapter_count: number;
  parsed_entries: unknown;
  published_at: string;
};

function isTestMode() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_TEST_MODE === "1";
}

function fixtureLesson(lesson: Lesson): PublishedLesson {
  if (lesson.id === "daily-conversation") {
    const target = "## At home\nI open the window.\nYou make breakfast.\nWe sit at the table.\nShe pours the tea.\nThey enjoy the morning.\n\nHe takes the bus.\nWe reach the office.\n## At work\nI read my messages.\nYou plan the day.\nWe start the meeting.";
    const korean = "## 집에서\n나는 창문을 연다.\n너는 아침을 준비한다.\n우리는 식탁에 앉는다.\n그녀는 차를 따른다.\n그들은 아침을 즐긴다.\n\n그는 버스를 탄다.\n우리는 사무실에 도착한다.\n## 직장에서\n나는 메시지를 읽는다.\n너는 하루를 계획한다.\n우리는 회의를 시작한다.";
    const { entries, summary } = parseLessonDraft(target, korean);
    const phrases = entries.filter((entry): entry is LessonPhrase => entry.kind === "phrase");
    return { ...lesson, phraseCount: phrases.length, sectionCount: summary.chapters, entries, phrases };
  }
  const targets = lesson.language === "english"
    ? ["I wake up at seven.", "I wash my face.", "I brush my teeth."]
    : ["私は 七時に 起きます。", "顔を洗います。", "歯を 磨きます。"];
  const korean = ["나는 일곱 시에 일어난다.", "나는 세수를 한다.", "나는 이를 닦는다."];
  const phrases: LessonPhrase[] = targets.map((target, index) => ({
    kind: "phrase", sourceLine: index + 1, phraseNumber: index + 1, target, korean: korean[index]
  }));
  return {
    ...lesson,
    phraseCount: targets.length,
    sectionCount: 0,
    entries: phrases,
    phrases
  };
}

function readLanguage(value: string): Language | null {
  return isLanguage(value) ? value : null;
}

function toPublishedLesson(row: PublishedLessonRow): PublishedLesson | null {
  const language = readLanguage(row.language);
  const entries = decodeLessonDraftEntries(row.parsed_entries);
  if (!entries) return null;
  const phrases = entries.filter((entry): entry is LessonPhrase => entry.kind === "phrase");
  if (!language || phrases.length !== row.phrase_count || phrases.length === 0) return null;
  if (entries.filter(entry => entry.kind === "chapter").length !== row.chapter_count) return null;
  const chapter = entries.find((entry) => entry.kind === "chapter");

  return {
    id: row.lesson_id,
    version: row.published_at,
    language,
    name: row.title,
    localizedName: chapter?.korean || row.title,
    phraseCount: row.phrase_count,
    sectionCount: row.chapter_count,
    entries,
    phrases
  };
}

export async function listPublishedLessons(): Promise<Lesson[]> {
  if (isTestMode()) return lessons.map(fixtureLesson);
  const supabase = createSecretSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("lesson_drafts")
    .select("id, lesson_id, title, language, phrase_count, chapter_count, parsed_entries, published_at")
    .eq("publication_status", "published")
    .order("published_at", { ascending: false });

  if (error) throw new Error(`Published lesson catalog failed: ${error.message}`);
  return (data as PublishedLessonRow[]).flatMap((row) => {
    const lesson = toPublishedLesson(row);
    return lesson ? [lesson] : [];
  });
}

export async function getPublishedLesson(id: string | null): Promise<PublishedLesson | null> {
  if (!id) return null;
  if (isTestMode()) {
    const lesson = lessons.find((candidate) => candidate.id === id);
    return lesson ? fixtureLesson(lesson) : null;
  }

  const supabase = createSecretSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("lesson_drafts")
    .select("id, lesson_id, title, language, phrase_count, chapter_count, parsed_entries, published_at")
    .eq("lesson_id", id)
    .eq("publication_status", "published")
    .maybeSingle();

  if (error) throw new Error(`Published lesson read failed: ${error.message}`);
  return data ? toPublishedLesson(data as PublishedLessonRow) : null;
}

function readAudioManifest(value: unknown): PublishedAudioItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (!Number.isInteger(candidate.phraseNumber) || typeof candidate.path !== "string") return [];
    return [candidate as PublishedAudioItem];
  });
}

export async function getPublishedAudio(lessonId: string, phraseNumber: number, version?: string | null) {
  if (isTestMode()) {
    const lesson = await getPublishedLesson(lessonId);
    if (!lesson || (version && lesson.version !== version) || !lesson.phrases.some(phrase => phrase.phraseNumber === phraseNumber)) return null;
    return { version: lesson.version, audio: { phraseNumber, canonicalName: `${phraseNumber}.webm`, path: "" } };
  }
  const supabase = createSecretSupabaseClient();
  if (!supabase) return null;

  const { data: lesson, error: lessonError } = await supabase
    .from("lesson_drafts")
    .select("audio_manifest, published_at")
    .eq("lesson_id", lessonId)
    .eq("publication_status", "published")
    .maybeSingle();
  if (lessonError) throw new Error(`Published lesson audio read failed: ${lessonError.message}`);
  if (!lesson) return null;
  if (version && lesson.published_at !== version) return null;

  const audio = readAudioManifest(lesson.audio_manifest).find((item) => item.phraseNumber === phraseNumber);
  if (!audio) return null;
  return { version: lesson.published_at as string, audio };
}

export async function createPublishedAudioUrl(lessonId: string, phraseNumber: number, version?: string | null) {
  const published = await getPublishedAudio(lessonId, phraseNumber, version);
  const supabase = createSecretSupabaseClient();
  if (!published || !supabase) return null;
  const { data, error } = await supabase.storage
    .from(LESSON_AUDIO_BUCKET)
    .createSignedUrl(published.audio.path, 60);
  if (error) throw new Error(`Signed audio URL failed: ${error.message}`);
  return data.signedUrl;
}
