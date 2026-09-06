import type { Language } from "./lessons";

export type SubtitleHint = { target: string; korean: string };

export function firstPracticeToken(text: string, language: Language | "korean"): string {
  const trimmed = text.trim();
  if (language === "japanese" && trimmed && !/\s/u.test(trimmed)) {
    const words = new Intl.Segmenter("ja", { granularity: "word" }).segment(trimmed);
    for (const word of words) if (word.isWordLike) return word.segment;
    return "";
  }
  return trimmed.split(/\s+/u)[0] ?? "";
}
