import { describe, expect, it } from "vitest";
import { parseLessonDraft } from "./lesson-draft-parser";

describe("parseLessonDraft", () => {
  it("aligns phrases while preserving chapters and unnamed section boundaries", () => {
    const result = parseLessonDraft(
      "## Morning Routine\nI wake up at seven.\n\nI wash my face.\n",
      "## 아침 일과\n나는 일곱 시에 일어난다.\n\n나는 세수를 한다.\n"
    );

    expect(result.publishReady).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.summary).toEqual({ phrases: 2, chapters: 1, sections: 1 });
    expect(result.entries).toEqual([
      { kind: "chapter", sourceLine: 1, target: "Morning Routine", korean: "아침 일과" },
      {
        kind: "phrase",
        sourceLine: 2,
        phraseNumber: 1,
        target: "I wake up at seven.",
        korean: "나는 일곱 시에 일어난다."
      },
      { kind: "section", sourceLine: 3 },
      {
        kind: "phrase",
        sourceLine: 4,
        phraseNumber: 2,
        target: "I wash my face.",
        korean: "나는 세수를 한다."
      }
    ]);
  });

  it("blocks a draft when the two files contain different phrase counts", () => {
    const result = parseLessonDraft(
      "I wake up at seven.\nI wash my face.\n",
      "나는 일곱 시에 일어난다.\n"
    );

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "phrase-count-mismatch", sourceLine: 2 })
    );
  });

  it("blocks a draft when chapter headings appear at different positions", () => {
    const result = parseLessonDraft(
      "## Morning Routine\nI wake up at seven.\n",
      "나는 일곱 시에 일어난다.\n## 아침 일과\n"
    );

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "chapter-position-mismatch", sourceLine: 1 })
    );
  });

  it("reports the exact line when only one side contains an empty phrase", () => {
    const result = parseLessonDraft(
      "I wake up at seven.\n\nI wash my face.\n",
      "나는 일곱 시에 일어난다.\n나는 물을 마신다.\n나는 세수를 한다.\n"
    );

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual({
      code: "empty-phrase",
      sourceLine: 2,
      message: "2행의 목표어 프레이즈가 비어 있습니다. 두 파일의 빈 줄 위치를 맞춰 주세요."
    });
  });

  it("blocks a draft that contains no ordinary phrases", () => {
    const result = parseLessonDraft("## Empty lesson\n", "## 빈 레슨\n");

    expect(result.publishReady).toBe(false);
    expect(result.issues).toContainEqual({
      code: "empty-lesson",
      sourceLine: 1,
      message: "학습할 프레이즈가 없습니다. 두 파일에 일반 문장을 한 줄 이상 추가해 주세요."
    });
  });
});
