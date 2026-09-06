import type { Language } from "./lessons";

export type SubtitleHint = { target: string; korean: string };

export function tokenizePracticeText(text: string, language: Language | "korean"): string[] {
  const trimmed = text.trim();
  if (language === "japanese" && trimmed && !/\s/u.test(trimmed)) {
    const tokens: string[] = [];
    let prefix = "";
    for (const word of new Intl.Segmenter("ja", { granularity: "word" }).segment(trimmed)) {
      if (word.isWordLike) {
        tokens.push(prefix + word.segment);
        prefix = "";
      } else if (tokens.length) tokens[tokens.length - 1] += word.segment;
      else prefix += word.segment;
    }
    return tokens.length ? tokens : [prefix];
  }
  return trimmed ? trimmed.split(/\s+/u) : [];
}

export function firstPracticeToken(text: string, language: Language | "korean"): string {
  const trimmed = text.trim();
  if (language === "japanese" && trimmed && !/\s/u.test(trimmed)) {
    const words = new Intl.Segmenter("ja", { granularity: "word" }).segment(trimmed);
    for (const word of words) if (word.isWordLike) return word.segment;
    return "";
  }
  return trimmed.split(/\s+/u)[0] ?? "";
}
