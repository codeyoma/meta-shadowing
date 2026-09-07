import type { GoogleSyntaxResponse } from "./google-syntax";
import type { SyntaxState } from "./sentence-syntax";

export type SyntaxToken = GoogleSyntaxResponse["tokens"][number];
export type SentenceAnalysis = {
  sentenceNumber: number;
  beginOffset: number;
  text: string;
  language: string;
  status: SyntaxState;
  tokens: SyntaxToken[];
};
export type PhraseSyntax = { phraseNumber: number; sentences: SentenceAnalysis[] };

// Google labels describe a dependency parse, not a guaranteed school-grammar
// sentence pattern. In particular ROOT may be a noun or adjective, not a verb.
// https://docs.cloud.google.com/natural-language/docs/reference/rest/v1/Token
const parts: Record<string, string> = {
  ADJ: "형용사", ADP: "전치사·후치사", ADV: "부사", CONJ: "접속사", DET: "한정사",
  NOUN: "명사", NUM: "수사", PRON: "대명사", PRT: "불변화사", PUNCT: "문장 부호",
  VERB: "동사", X: "기타", AFFIX: "접사", UNKNOWN: "품사 미분류"
};
export function syntaxPartLabel(tag: string, language: string) {
  if (tag === "ADP" && language === "en") return "전치사";
  return parts[tag] ?? "품사 미분류";
}

const relations: Record<string, string> = {
  ROOT: "문장의 중심", NSUBJ: "주어", NSUBJPASS: "수동문의 주어", CSUBJ: "주어절",
  CSUBJPASS: "수동문의 주어절", DOBJ: "직접목적어", IOBJ: "간접목적어",
  ACOMP: "형용사 보어", ATTR: "연결동사의 보어", CCOMP: "보어절", XCOMP: "주어가 생략된 보어절",
  AMOD: "형용사 수식", ADVMOD: "부사 수식", ADVCL: "부사절 수식", NN: "복합명사 수식",
  VMOD: "비정형 동사절 수식", PARTMOD: "분사 수식", RCMOD: "관계절 수식", APPOS: "동격",
  AUX: "조동사", AUXPASS: "수동태 조동사", COP: "연결동사", PREP: "전치사 수식",
  POBJ: "전치사의 목적어", PCOMP: "전치사의 보어절", DET: "한정사", POSS: "소유 수식",
  NEG: "부정", NUM: "수량 수식", NUMBER: "복합 수의 구성 요소", CC: "등위접속사", CONJ: "병렬 연결",
  MARK: "종속절 표지", PRT: "불변화사 연결", MWE: "여러 단어로 된 표현", MWV: "여러 단어로 된 동사",
  P: "문장 부호", TMOD: "시간 수식", TOPIC: "주제 표지", QUANTMOD: "수량 표현 수식",
  NPADVMOD: "명사구의 부사적 수식", DTMOD: "명사 앞 수식", GMOD: "소유격 수식",
  ADVPHMOD: "부사구 수식", NOMC: "명사절", PREDET: "전한정사", PRECOMP: "서술부 보어",
  DEP: "관계 미분류", UNKNOWN: "관계 미분류"
};
export function syntaxRelationLabel(label: string) { return relations[label] ?? `기타 관계 (${label})`; }

const forms: Record<string, string> = {
  PAST: "과거", PRESENT: "현재", FUTURE: "미래", IMPERFECT: "반과거", PLUPERFECT: "대과거",
  CONDITIONAL_TENSE: "조건 시제", SINGULAR: "단수", PLURAL: "복수", DUAL: "쌍수",
  FIRST: "1인칭", SECOND: "2인칭", THIRD: "3인칭", ACTIVE: "능동태", PASSIVE: "수동태", CAUSATIVE: "사역",
  PROGRESSIVE: "진행상", PERFECTIVE: "완결상", IMPERFECTIVE: "비완결상", GERUND: "동명사형",
  NOMINATIVE: "주격", ACCUSATIVE: "대격", DATIVE: "여격", GENITIVE: "소유격",
  FEMININE: "여성", MASCULINE: "남성", NEUTER: "중성", PROPER: "고유명사",
  INDICATIVE: "직설법", IMPERATIVE: "명령법", SUBJUNCTIVE: "접속법", CONDITIONAL_MOOD: "조건법"
};
export function syntaxFeatures(token: SyntaxToken): string[] {
  return [...new Set(Object.entries(token.partOfSpeech).flatMap(([key, value]) =>
    key !== "tag" && typeof value === "string" && forms[value] ? [forms[value]] : []))];
}

export function syntaxConnection(token: SyntaxToken, tokens: SyntaxToken[]): string {
  if (token.dependencyEdge.label === "ROOT") return "이 문장의 중심으로 분석된 단어예요.";
  const head = tokens[token.dependencyEdge.headTokenIndex];
  if (!head) return "연결된 단어를 확인할 수 없어요.";
  return `‘${head.text.content}’에 ‘${syntaxRelationLabel(token.dependencyEdge.label)}’ 관계로 연결돼요.`;
}
