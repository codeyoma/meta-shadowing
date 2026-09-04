import type { LessonDraftEntry } from "./lesson-draft-parser";
import {
  getSupportedAudioFormat,
  matchesDeclaredAudioType,
  type AudioContentType
} from "./audio-format";

export type AudioFileDescriptor = {
  name: string;
  size: number;
  type: string;
};

export type AudioPackageItem = {
  phraseNumber: number;
  sourceLine: number;
  originalName: string;
  canonicalName: string;
  contentType: AudioContentType;
  size: number;
};

export type AudioPackageIssue = {
  code: string;
  phraseNumber?: number;
  fileName?: string;
  message: string;
};

export type AudioPackageResult = {
  publishReady: boolean;
  items: AudioPackageItem[];
  issues: AudioPackageIssue[];
};

function getLeadingNumber(fileName: string) {
  const match = /^(\d{3})(?=[^0-9]|$)/.exec(fileName);
  return match ? { label: match[1], value: Number(match[1]) } : null;
}

export function mapAudioPackage(
  entries: LessonDraftEntry[],
  files: AudioFileDescriptor[]
): AudioPackageResult {
  const phrases = entries.filter((entry) => entry.kind === "phrase");
  const items = files
    .map((file) => {
      const leadingNumber = getLeadingNumber(file.name);
      const format = getSupportedAudioFormat(file.name);
      if (!leadingNumber) return null;

      const phraseNumber = leadingNumber.value;
      const phrase = phrases.find((entry) => entry.phraseNumber === phraseNumber);

      if (!phrase || !format) return null;

      return {
        phraseNumber,
        sourceLine: phrase.sourceLine,
        originalName: file.name,
        canonicalName: `${String(phraseNumber).padStart(3, "0")}.${format.extension}`,
        contentType: format.contentType,
        size: file.size
      } satisfies AudioPackageItem;
    })
    .filter((item) => item !== null)
    .sort((left, right) => left.phraseNumber - right.phraseNumber);
  const mappedNumbers = new Set(items.map((item) => item.phraseNumber));
  const issues: AudioPackageIssue[] = files.flatMap((file) => {
    const fileIssues: AudioPackageIssue[] = [];
    const format = getSupportedAudioFormat(file.name);
    const leadingNumber = getLeadingNumber(file.name);

    if (!format) {
      fileIssues.push({
        code: "unsupported-audio-format",
        fileName: file.name,
        message: `${file.name}은(는) 지원하지 않는 형식입니다. MP3, M4A, WebM 파일만 사용해 주세요.`
      });
    } else if (!matchesDeclaredAudioType(file.name, file.type)) {
      fileIssues.push({
        code: "audio-content-type-mismatch",
        fileName: file.name,
        message: `${file.name}의 미디어 형식이 ${format.label} 파일과 일치하지 않습니다. 원본 오디오 파일을 다시 선택해 주세요.`
      });
    }

    if (!leadingNumber) {
      fileIssues.push({
        code: "invalid-audio-number",
        fileName: file.name,
        message: `${file.name}의 파일명은 001처럼 세 자리 번호로 시작해야 합니다.`
      });
    } else if (leadingNumber.value < 1 || leadingNumber.value > phrases.length) {
      fileIssues.push({
        code: "invalid-audio-number",
        fileName: file.name,
        message: `${file.name}의 번호 ${leadingNumber.label}은(는) 유효한 프레이즈 범위 001~${String(phrases.length).padStart(3, "0")} 밖입니다.`
      });
    }

    return fileIssues;
  });
  issues.push(...phrases
    .filter((phrase) => !mappedNumbers.has(phrase.phraseNumber))
    .map((phrase) => ({
      code: "missing-audio",
      phraseNumber: phrase.phraseNumber,
      message: `${phrase.phraseNumber}번 프레이즈의 음성 파일이 없습니다. ${String(phrase.phraseNumber).padStart(3, "0")}로 시작하는 파일을 추가해 주세요.`
    })));
  const seenNumbers = new Set<number>();

  for (const item of items) {
    if (seenNumbers.has(item.phraseNumber)) {
      issues.push({
        code: "duplicate-audio-number",
        phraseNumber: item.phraseNumber,
        fileName: item.originalName,
        message: `${item.phraseNumber}번 프레이즈의 음성 파일 번호가 중복됩니다. 번호마다 파일을 하나만 남겨 주세요.`
      });
    }
    seenNumbers.add(item.phraseNumber);
  }

  return { publishReady: issues.length === 0, items, issues };
}
