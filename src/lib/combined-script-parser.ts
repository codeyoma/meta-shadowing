import type { LessonDraftEntry, LessonDraftIssue, LessonDraftParseResult } from "./lesson-draft-parser";

const HANGUL = /\p{Script=Hangul}/u;
const LETTER = /\p{L}/u;

export function parseCombinedLessonDraft(source: string): LessonDraftParseResult {
  const entries: LessonDraftEntry[] = [];
  const issues: LessonDraftIssue[] = [];
  let phraseNumber = 0;
  let chapters = 0;
  let pending: { sourceLine: number; target: string[]; korean: string[] } | null = null;

  function finishPhrase() {
    if (!pending) return;
    if (!pending.target.length || !pending.korean.length) {
      const missingTarget = !pending.target.length;
      issues.push({
        code: missingTarget ? "missing-target" : "missing-korean",
        sourceLine: pending.sourceLine,
        message: `${pending.sourceLine}행부터 시작한 프레이즈에 ${missingTarget ? "목표어가" : "한국어 번역이"} 없습니다. 목표어 묶음 다음에 한국어 묶음을 넣어 주세요.`
      });
    }
    entries.push({
      kind: "phrase",
      sourceLine: pending.sourceLine,
      phraseNumber: ++phraseNumber,
      target: pending.target.join("\n"),
      korean: pending.korean.join("\n")
    });
    pending = null;
  }

  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    if (line.startsWith("## ")) {
      finishPhrase();
      const title = line.slice(3).trim();
      if (!title) issues.push({
        code: "empty-chapter-title", sourceLine: index + 1,
        message: `${index + 1}행의 챕터 제목이 비어 있습니다. ## 뒤에 제목을 입력해 주세요.`
      });
      entries.push({ kind: "chapter", sourceLine: index + 1, target: title, korean: "" });
      chapters += 1;
      continue;
    }

    if (!LETTER.test(line)) {
      issues.push({
        code: "unclassified-line", sourceLine: index + 1,
        message: `${index + 1}행은 숫자나 기호만 있어 언어를 구분할 수 없습니다. 해당 내용은 같은 언어의 문장 줄에 붙여 주세요.`
      });
      continue;
    }

    const side = HANGUL.test(line) ? "korean" : "target";
    if (side === "target" && pending?.korean.length) finishPhrase();
    pending ??= { sourceLine: index + 1, target: [], korean: [] };
    pending[side].push(line);
  }
  finishPhrase();

  if (!phraseNumber) issues.push({
    code: "empty-lesson", sourceLine: 1,
    message: "학습할 프레이즈가 없습니다. 목표어와 한국어 번역을 순서대로 추가해 주세요."
  });

  return { publishReady: issues.length === 0, entries, issues, summary: { phrases: phraseNumber, chapters, sections: 0 } };
}
