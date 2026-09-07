import type { LessonDraftEntry } from "./lesson-draft-parser";

export type SyntaxLanguage = "en" | "ja" | "zh" | "es" | "de" | "fr";
export type SyntaxState = "pending" | "processing" | "complete" | "failed";
export type SyntaxProgress = {
  configured: boolean;
  total: number;
  pending: number;
  processing: number;
  complete: number;
  failed: number;
  estimatedUnits: number;
  errors: string[];
};
export type SentenceInput = {
  phraseNumber: number;
  sentenceNumber: number;
  beginOffset: number;
  text: string;
  languageCode: SyntaxLanguage;
};

export function syntaxLanguage(language: string): SyntaxLanguage {
  const codes: Record<string, SyntaxLanguage> = {
    english: "en", japanese: "ja", chinese: "zh", spanish: "es", german: "de", french: "fr",
    en: "en", ja: "ja", zh: "zh", es: "es", de: "de", fr: "fr"
  };
  const code = codes[language];
  if (!code) throw new Error("Unsupported syntax language");
  return code;
}

// Offsets use JavaScript/Google UTF16 units. Splitting never changes the stored
// phrase text or the phrase-to-audio mapping; dialogue lines keep their offsets.
export function lessonSentences(entries: LessonDraftEntry[], language: string): SentenceInput[] {
  const languageCode = syntaxLanguage(language);
  const segmenter = new Intl.Segmenter(languageCode, { granularity: "sentence" });
  const sentences: SentenceInput[] = [];
  for (const entry of entries) {
    if (entry.kind !== "phrase") continue;
    let sentenceNumber = 0;
    for (const line of entry.target.matchAll(/[^\r\n]+/g)) {
      for (const segment of segmenter.segment(line[0])) {
        const text = segment.segment.trim();
        if (!text) continue;
        sentences.push({
          phraseNumber: entry.phraseNumber, sentenceNumber: ++sentenceNumber,
          beginOffset: line.index + segment.index + segment.segment.indexOf(text),
          text, languageCode
        });
      }
    }
  }
  return sentences;
}

export function syntaxUnits(text: string): number {
  return Math.ceil(Array.from(text).length / 1000);
}

export function syntaxErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    "not-configured": "Google Cloud 인증 정보를 설정하면 분석을 시작할 수 있습니다.",
    "credentials-unavailable": "서비스 계정 JSON 파일의 경로와 읽기 권한을 확인해 주세요.",
    "invalid-credentials": "올바른 서비스 계정 JSON 키 파일인지 확인해 주세요.",
    "google-auth": "서비스 계정 인증에 실패했습니다. 키의 유효성과 서버의 Google 연결을 확인해 주세요.",
    "google-400": "Google이 문장을 분석하지 못했습니다. 입력 문장과 지원 언어를 확인해 주세요.",
    "google-401": "Google Cloud 인증 정보를 확인해 주세요.",
    "google-403": "Natural Language API 활성화, 결제 연결과 인증 정보의 사용 권한을 확인해 주세요.",
    "google-429": "Google 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    "timeout": "Google 분석 응답 시간이 초과되었습니다. 다시 시도해 주세요.",
    "sentence-too-long": "20,000자를 초과한 문장이 있습니다. 문장을 나눠 새 초안으로 등록해 주세요.",
    "invalid-response": "분석 결과의 형식이 올바르지 않습니다. 다시 시도해 주세요."
  };
  return messages[code] ?? "일부 문장을 분석하지 못했습니다. 다시 시도해 주세요.";
}
