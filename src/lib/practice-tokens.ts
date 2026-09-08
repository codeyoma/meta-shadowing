import type { Language } from "./lessons";
import { languageCode } from "./languages";

export type SubtitleHint = { target: string; korean: string };

export function tokenizePracticeText(text: string, language: Language | "korean"): string[] {
  const trimmed = text.trim();
  const usesUnspacedWords = language === "japanese" || language === "chinese";
  if (usesUnspacedWords && /[\r\n]/u.test(trimmed)) {
    return trimmed.split(/\r\n?|\n/u).flatMap(line => tokenizePracticeText(line, language));
  }
  if (usesUnspacedWords && trimmed && !/\s/u.test(trimmed)) {
    const tokens: string[] = [];
    let prefix = "";
    for (const word of new Intl.Segmenter(languageCode(language), { granularity: "word" }).segment(trimmed)) {
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
  return tokenizePracticeText(text, language)[0] ?? "";
}
