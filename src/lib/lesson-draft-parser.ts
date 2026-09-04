export type LessonDraftEntry =
  | { kind: "chapter"; sourceLine: number; target: string; korean: string }
  | { kind: "section"; sourceLine: number }
  | {
      kind: "phrase";
      sourceLine: number;
      phraseNumber: number;
      target: string;
      korean: string;
    };

export type LessonDraftIssue = {
  code: string;
  sourceLine: number;
  message: string;
};

export type LessonDraftParseResult = {
  publishReady: boolean;
  entries: LessonDraftEntry[];
  issues: LessonDraftIssue[];
  summary: { phrases: number; chapters: number; sections: number };
};

function splitSource(text: string) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function parseLessonDraft(targetSource: string, koreanSource: string): LessonDraftParseResult {
  const targetLines = splitSource(targetSource);
  const koreanLines = splitSource(koreanSource);
  const entries: LessonDraftEntry[] = [];
  const issues: LessonDraftIssue[] = [];
  let phraseNumber = 0;

  const countPhrases = (lines: string[]) =>
    lines.filter((line) => line.trim() !== "" && !line.startsWith("## ")).length;
  const targetPhraseCount = countPhrases(targetLines);
  const koreanPhraseCount = countPhrases(koreanLines);

  if (targetPhraseCount !== koreanPhraseCount) {
    issues.push({
      code: "phrase-count-mismatch",
      sourceLine: Math.min(targetLines.length, koreanLines.length) + 1,
      message: `목표어 ${targetPhraseCount}개와 한국어 ${koreanPhraseCount}개의 프레이즈 수가 다릅니다. 두 파일의 일반 문장 수를 맞춰 주세요.`
    });
  }

  for (let index = 0; index < Math.max(targetLines.length, koreanLines.length); index += 1) {
    const target = targetLines[index] ?? "";
    const korean = koreanLines[index] ?? "";
    const sourceLine = index + 1;
    const targetIsChapter = target.startsWith("## ");
    const koreanIsChapter = korean.startsWith("## ");
    const targetIsBlank = target.trim() === "";
    const koreanIsBlank = korean.trim() === "";

    if (targetIsChapter !== koreanIsChapter) {
      issues.push({
        code: "chapter-position-mismatch",
        sourceLine,
        message: `${sourceLine}행의 챕터 제목 위치가 두 파일에서 다릅니다. 같은 행에 ## 제목을 배치해 주세요.`
      });
      entries.push({
        kind: "chapter",
        sourceLine,
        target: targetIsChapter ? target.slice(3).trim() : target.trim(),
        korean: koreanIsChapter ? korean.slice(3).trim() : korean.trim()
      });
      continue;
    }

    if (targetIsChapter && koreanIsChapter) {
      entries.push({
        kind: "chapter",
        sourceLine,
        target: target.slice(3).trim(),
        korean: korean.slice(3).trim()
      });
      continue;
    }

    if (targetIsBlank && koreanIsBlank) {
      entries.push({ kind: "section", sourceLine });
      continue;
    }

    if (targetIsBlank !== koreanIsBlank) {
      const emptySide = targetIsBlank ? "목표어" : "한국어";
      issues.push({
        code: "empty-phrase",
        sourceLine,
        message: `${sourceLine}행의 ${emptySide} 프레이즈가 비어 있습니다. 두 파일의 빈 줄 위치를 맞춰 주세요.`
      });
    }

    phraseNumber += 1;
    entries.push({ kind: "phrase", sourceLine, phraseNumber, target, korean });
  }

  const chapters = entries.filter((entry) => entry.kind === "chapter").length;
  const sections = entries.filter((entry) => entry.kind === "section").length;

  if (phraseNumber === 0) {
    issues.push({
      code: "empty-lesson",
      sourceLine: 1,
      message: "학습할 프레이즈가 없습니다. 두 파일에 일반 문장을 한 줄 이상 추가해 주세요."
    });
  }

  return {
    publishReady: issues.length === 0,
    entries,
    issues,
    summary: { phrases: phraseNumber, chapters, sections }
  };
}
