import { describe, expect, it } from "vitest";
import type { LessonDraftEntry } from "./lesson-draft-parser";
import { lessonSentences, syntaxLanguage, syntaxUnits } from "./sentence-syntax";

const phrase = (target: string, phraseNumber = 1): LessonDraftEntry => ({ kind: "phrase", sourceLine: 1, phraseNumber, target, korean: "학습용 번역" });
describe("sentence preparation", () => {
  it("keeps phrase/audio identity and UTF16 offsets across sentences and dialogue lines", () => {
    const target = "  😀 Hello! How are you?\r\n  I am fine.";
    const sentences = lessonSentences([phrase(target, 7)], "english");
    expect(sentences.map(sentence => sentence.text)).toEqual(["😀 Hello!", "How are you?", "I am fine."]);
    expect(sentences.map(sentence => sentence.sentenceNumber)).toEqual([1, 2, 3]);
    for (const sentence of sentences) {
      expect(sentence.phraseNumber).toBe(7);
      expect(target.slice(sentence.beginOffset, sentence.beginOffset + sentence.text.length)).toBe(sentence.text);
    }
    expect(sentences[1].beginOffset).toBe(target.indexOf("How"));
  });
  it("splits Japanese punctuation and ignores metadata and blank lines", () => {
    const sentences = lessonSentences([
      { kind: "chapter", sourceLine: 1, target: "第一章", korean: "1장" },
      { kind: "section", sourceLine: 2 }, phrase("学校へ行く。猫がいる！\n\nこんにちは。")
    ], "japanese");
    expect(sentences.map(sentence => sentence.text)).toEqual(["学校へ行く。", "猫がいる！", "こんにちは。"]);
    expect(sentences.every(sentence => sentence.languageCode === "ja")).toBe(true);
  });
  it("counts Unicode characters rather than UTF16 code units for billing estimates", () => {
    expect(syntaxUnits("😀".repeat(1000))).toBe(1);
    expect(syntaxUnits("あ".repeat(1001))).toBe(2);
  });
  it("accepts the six supported provider languages and rejects unknown input", () => {
    expect(["en", "ja", "zh", "es", "de", "fr"].map(syntaxLanguage)).toEqual(["en", "ja", "zh", "es", "de", "fr"]);
    expect(() => syntaxLanguage("made-up")).toThrow();
  });
});
