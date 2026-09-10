import type { PublishedLesson, Language } from "./lessons";
import type { DictionaryEntry } from "./dictionary";
import { normalizeDictionaryLookup, parseDictionaryWord } from "./dictionary";
import { languageCode } from "./languages";
import type { PhraseSyntax } from "./phrase-syntax";
import type { RapidLine } from "./rapid-session";
import type { SubtitleHint } from "./practice-tokens";

export type PackageAudio = { assetId: string; phraseNumber: number; mimeType: string; size: number; sha256: string };
export type PackageWord = { segment: string; index: number; isWordLike?: boolean };
export type LessonPackage = {
  schemaVersion: 1;
  lesson: PublishedLesson;
  audio: PackageAudio[];
  dictionary: Record<string, { status: "available" | "unavailable"; entries: DictionaryEntry[] }>;
  syntax: (PhraseSyntax & { status: "available" | "unavailable" })[];
  words: Record<string, PackageWord[]>;
  hints: SubtitleHint[];
  lines: RapidLine[];
};
export type PackageAcquisition = { accountId: string; manifest: LessonPackage; sha256: string };

export function packageKey(lessonId: string, version: string) { return JSON.stringify([lessonId, version]); }
export function packageWords(text: string, language: Language): PackageWord[] {
  const segments = [...new Intl.Segmenter(languageCode(language), { granularity: "word" }).segment(text)];
  const joined: PackageWord[] = [];
  for (let index = 0; index < segments.length; index++) {
    const part = { segment: segments[index].segment, index: segments[index].index, isWordLike: segments[index].isWordLike };
    while (language === "english" && part.isWordLike && /^[\-‐‑]$/u.test(segments[index + 1]?.segment ?? "") && segments[index + 2]?.isWordLike) {
      part.segment += segments[index + 1].segment + segments[index + 2].segment;
      index += 2;
    }
    joined.push(part);
  }
  return joined;
}
export function packageLookupKey(word: string) { return normalizeDictionaryLookup(word); }
export function validPackageWord(word: string) { return parseDictionaryWord(word) !== null; }
export async function sha256(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
}
export async function manifestDigest(manifest: LessonPackage) {
  return sha256(new TextEncoder().encode(JSON.stringify(manifest)).buffer);
}
export async function verifyPackageAudio(audio: PackageAudio, blob: Blob) {
  if (blob.size !== audio.size || blob.type !== audio.mimeType || await sha256(await blob.arrayBuffer()) !== audio.sha256) {
    throw new Error("Downloaded audio failed verification");
  }
}
export function validatePackage(manifest: LessonPackage) {
  if (manifest?.schemaVersion !== 1 || !manifest.lesson?.id || !manifest.lesson.version
    || !Array.isArray(manifest.lesson.phrases) || !manifest.lesson.phrases.length
    || manifest.lesson.phraseCount !== manifest.lesson.phrases.length
    || !Array.isArray(manifest.audio) || manifest.audio.length !== manifest.lesson.phrases.length
    || !Array.isArray(manifest.syntax) || manifest.syntax.length !== manifest.lesson.phrases.length
    || !manifest.dictionary || !manifest.words || !Array.isArray(manifest.hints) || !Array.isArray(manifest.lines)) throw new Error("Invalid lesson package");
  const seen = new Set<number>();
  for (const [index, phrase] of manifest.lesson.phrases.entries()) {
    const audio = manifest.audio[index], syntax = manifest.syntax[index];
    if (seen.has(phrase.phraseNumber) || audio.phraseNumber !== phrase.phraseNumber || syntax.phraseNumber !== phrase.phraseNumber
      || !/^[a-f0-9]{64}$/.test(audio.sha256) || !Number.isSafeInteger(audio.size) || audio.size < 1 || audio.size > 4 * 1024 * 1024
      || !["audio/mpeg", "audio/webm", "audio/mp4", "audio/ogg", "audio/wav"].includes(audio.mimeType)
      || !Array.isArray(syntax.sentences) || !["available", "unavailable"].includes(syntax.status)
      || !Array.isArray(manifest.words[phrase.target])) throw new Error("Incomplete lesson package");
    for (const word of manifest.words[phrase.target]) if (word.isWordLike && validPackageWord(word.segment)) {
      const entry = manifest.dictionary[packageLookupKey(word.segment)];
      if (!entry || !Array.isArray(entry.entries) || !["available", "unavailable"].includes(entry.status)) throw new Error("Incomplete package dictionary");
    }
    seen.add(phrase.phraseNumber);
  }
}
