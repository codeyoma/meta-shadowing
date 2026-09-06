import { describe, expect, it } from "vitest";
import { parseCombinedLessonDraft } from "./combined-script-parser";
import { mapAudioPackage } from "./audio-package";
import { groupLessonPhrases } from "./phrase-groups";

describe("combined script imports", () => {
  it("ignores layout blanks and keeps all sentences and dialogue turns in their bilingual phrase", () => {
    const result = parseCombinedLessonDraft([
      "## Section 1",
      "",
      "Open the window.",
      "창문을 열어 주세요.",
      "", "", "",
      "The air is cool. Bring a coat.",
      "공기가 차가워요. 외투를 가져오세요.",
      "", "",
      "We can wait here.",
      "",
      "여기서 기다리면 돼요.",
      "", "", "",
      '"Are you ready?"',
      '"Almost. Give me a minute."',
      '"준비됐어요?"',
      '"거의요. 잠깐만 기다려 주세요."'
    ].join("\n"));

    expect(result.publishReady).toBe(true);
    expect(result.summary).toEqual({ phrases: 4, chapters: 1, sections: 0 });
    expect(result.entries).toEqual([
      { kind: "chapter", sourceLine: 1, target: "Section 1", korean: "" },
      { kind: "phrase", sourceLine: 3, phraseNumber: 1, target: "Open the window.", korean: "창문을 열어 주세요." },
      { kind: "phrase", sourceLine: 8, phraseNumber: 2, target: "The air is cool. Bring a coat.", korean: "공기가 차가워요. 외투를 가져오세요." },
      { kind: "phrase", sourceLine: 12, phraseNumber: 3, target: "We can wait here.", korean: "여기서 기다리면 돼요." },
      { kind: "phrase", sourceLine: 18, phraseNumber: 4, target: '"Are you ready?"\n"Almost. Give me a minute."', korean: '"준비됐어요?"\n"거의요. 잠깐만 기다려 주세요."' }
    ]);
  });

  it("uses Hangul to distinguish Korean from Japanese and preserves supplied word spaces", () => {
    const result = parseCombinedLessonDraft('私は 本を 読みます。\n나는 책을 읽어요.\n「何を読みますか？」\n「小説です。」\n"무엇을 읽어요?"\n"소설이에요."');
    expect(result.summary.phrases).toBe(2);
    expect(result.entries).toEqual([
      { kind: "phrase", sourceLine: 1, phraseNumber: 1, target: "私は 本を 読みます。", korean: "나는 책을 읽어요." },
      { kind: "phrase", sourceLine: 3, phraseNumber: 2, target: "「何を読みますか？」\n「小説です。」", korean: '"무엇을 읽어요?"\n"소설이에요."' }
    ]);
  });

  it("normalizes BOM and Windows/Mac newlines without changing phrase line references", () => {
    const result = parseCombinedLessonDraft("\uFEFF## First\r\n  Read the book.\r\n책을 읽어요.\rNext line.\r다음 줄이에요.\r");
    expect(result.entries).toEqual([
      { kind: "chapter", sourceLine: 1, target: "First", korean: "" },
      { kind: "phrase", sourceLine: 2, phraseNumber: 1, target: "  Read the book.", korean: "책을 읽어요." },
      { kind: "phrase", sourceLine: 4, phraseNumber: 2, target: "Next line.", korean: "다음 줄이에요." }
    ]);
  });

  it("recognizes decomposed Hangul as a translation", () => {
    const korean = "책을 읽어요.".normalize("NFD");
    const result = parseCombinedLessonDraft(`Read the book.\n${korean}`);
    expect(result.publishReady).toBe(true);
    expect(result.entries).toEqual([
      { kind: "phrase", sourceLine: 1, phraseNumber: 1, target: "Read the book.", korean }
    ]);
  });

  it.each([
    { source: "\n\t\n", code: "empty-lesson", line: 1 },
    { source: "## Empty", code: "empty-lesson", line: 1 },
    { source: "\n번역만 있어요.", code: "missing-target", line: 2 },
    { source: "\nMissing translation.", code: "missing-korean", line: 2 },
    { source: "## \nHello.\n안녕.", code: "empty-chapter-title", line: 1 },
    { source: "Hello.\n안녕.\n123", code: "unclassified-line", line: 3 },
    { source: "Hello.\n안녕.\n...", code: "unclassified-line", line: 3 }
  ])("blocks $code with an actionable source line", ({ source, code, line }) => {
    const result = parseCombinedLessonDraft(source);
    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code, sourceLine: line }));
  });

  it("never pairs a translation with a target from an earlier chapter", () => {
    const result = parseCombinedLessonDraft("Missing translation.\n## Next\n번역만 있어요.");
    expect(result.publishReady).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "missing-korean", sourceLine: 1 }),
      expect.objectContaining({ code: "missing-target", sourceLine: 3 })
    ]);
  });

  it("numbers audio by bilingual phrase and keeps practice groups inside chapters", () => {
    const result = parseCombinedLessonDraft('## First\n"Read."\n"Listen."\n"읽어요."\n"들어요."\n## Second\nNext.\n다음이에요.');
    const audio = mapAudioPackage(result.entries, [
      { name: "002-next.mp3", size: 50, type: "audio/mpeg" },
      { name: "001-dialogue.mp3", size: 50, type: "audio/mpeg" }
    ]);
    expect(audio.publishReady).toBe(true);
    expect(audio.items.map(item => ({ phraseNumber: item.phraseNumber, originalName: item.originalName }))).toEqual([
      { phraseNumber: 1, originalName: "001-dialogue.mp3" },
      { phraseNumber: 2, originalName: "002-next.mp3" }
    ]);
    expect(groupLessonPhrases(result.entries, 2).map(group => group.phrases.map(phrase => phrase.phraseNumber))).toEqual([[1], [2]]);
  });
});
