import "server-only";

import { lessons, type Language, type Lesson, type LessonPhrase, type PublishedLesson } from "./lessons";
import { LESSON_AUDIO_BUCKET } from "./lesson-audio";
import type { PublishedAudioItem } from "./lesson-publication";
import { createSecretSupabaseClient } from "./supabase/secret";

type PublishedLessonRow = {
  id: string;
  title: string;
  language: string;
  phrase_count: number;
  parsed_entries: unknown;
};

function isTestMode() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_TEST_MODE === "1";
}

function fixtureLesson(lesson: Lesson): PublishedLesson {
  const target = lesson.language === "english" ? "I wake up at seven." : "私は 七時に 起きます。";
  const korean = "나는 일곱 시에 일어난다.";
  return {
    ...lesson,
    phrases: [{ kind: "phrase", sourceLine: 1, phraseNumber: 1, target, korean }]
  };
}

function readLanguage(value: string): Language | null {
  return value === "english" || value === "japanese" ? value : null;
}

function readPhrases(value: unknown): LessonPhrase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    if (
      candidate.kind !== "phrase" ||
      !Number.isInteger(candidate.sourceLine) ||
      !Number.isInteger(candidate.phraseNumber) ||
      typeof candidate.target !== "string" ||
      typeof candidate.korean !== "string"
    ) {
      return [];
    }
    return [candidate as LessonPhrase];
  });
}

function readChapter(value: unknown) {
  if (!Array.isArray(value)) return null;
  const entry = value.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const chapter = candidate as Record<string, unknown>;
    return chapter.kind === "chapter" && typeof chapter.target === "string" && typeof chapter.korean === "string";
  }) as { target: string; korean: string } | undefined;
  return entry ?? null;
}

function toPublishedLesson(row: PublishedLessonRow): PublishedLesson | null {
  const language = readLanguage(row.language);
  const phrases = readPhrases(row.parsed_entries);
  if (!language || phrases.length !== row.phrase_count || phrases.length === 0) return null;
  const chapter = readChapter(row.parsed_entries);

  return {
    id: row.id,
    language,
    name: row.title,
    localizedName: chapter?.korean || row.title,
    phraseCount: row.phrase_count,
    phrases
  };
}

export async function listPublishedLessons(): Promise<Lesson[]> {
  if (isTestMode()) return lessons;
  const supabase = createSecretSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("lesson_drafts")
    .select("id, title, language, phrase_count, parsed_entries")
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
    .select("id, title, language, phrase_count, parsed_entries")
    .eq("id", id)
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

export async function createPublishedAudioUrl(lessonId: string, phraseNumber: number) {
  const supabase = createSecretSupabaseClient();
  if (!supabase) return null;

  const { data: lesson, error: lessonError } = await supabase
    .from("lesson_drafts")
    .select("audio_manifest")
    .eq("id", lessonId)
    .eq("publication_status", "published")
    .maybeSingle();
  if (lessonError) throw new Error(`Published lesson audio read failed: ${lessonError.message}`);
  if (!lesson) return null;

  const audio = readAudioManifest(lesson.audio_manifest).find((item) => item.phraseNumber === phraseNumber);
  if (!audio) return null;
  const { data, error } = await supabase.storage
    .from(LESSON_AUDIO_BUCKET)
    .createSignedUrl(audio.path, 60);
  if (error) throw new Error(`Signed audio URL failed: ${error.message}`);
  return data.signedUrl;
}
