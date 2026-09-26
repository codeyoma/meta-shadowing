export type AnalysisToken = { text: string; offset: number; pos: string; head: number; relation: string };
export type AnalysisSentence = { id: string; sourceIndex: number; text: string; tokens: AnalysisToken[] };

const invalid = () => new Error('sentence-analysis-invalid');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > limit) throw invalid();
  return value;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw invalid();
  return value;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid();
  return value as number;
}
function span(value: unknown, source: string) {
  const item = object(value), text = string(item.content), offset = integer(item.beginOffset);
  if (source.slice(offset, offset + text.length) !== text) throw invalid();
  return { text, offset, end: offset + text.length };
}
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Validate local analysis before returning only the current unit's target-language sentences. */
export function readSentenceAnalysis(raw: string, phrases: readonly { text: string }[], language: string,
  sourceIndices: readonly number[]): AnalysisSentence[] {
  if (raw.length > 20_000_000) throw invalid();
  const doc = object(JSON.parse(raw));
  if (doc.schemaVersion !== 1 || doc.complete !== true || doc.encodingType !== 'UTF16'
    || doc.language !== language || doc.entryCount !== phrases.length) throw invalid();
  const entries = list(doc.entries, 100_000);
  if (entries.length !== phrases.length || !sourceIndices.length || new Set(sourceIndices).size !== sourceIndices.length
    || sourceIndices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= phrases.length)) throw invalid();
  const result = new Map<number, AnalysisSentence[]>();
  entries.forEach((value, sourceIndex) => {
    const entry = object(value), text = string(entry.text), analysis = object(entry.analysis);
    if (entry.phraseNumber !== sourceIndex + 1 || entry.status !== 'complete' || entry.error !== null
      || analysis.language !== language || normalized(text) !== normalized(phrases[sourceIndex]!.text)) throw invalid();
    const sentences = list(analysis.sentences, 1000).map(value => span(object(value).text, text));
    const tokens = list(analysis.tokens, 10_000).map(value => {
      const token = object(value), edge = object(token.dependencyEdge);
      return { ...span(token.text, text), pos: string(object(token.partOfSpeech).tag),
        head: integer(edge.headTokenIndex), relation: string(edge.label) };
    });
    const owners = tokens.map(token => sentences.findIndex(s => token.offset >= s.offset && token.end <= s.end));
    for (const spans of [sentences, tokens]) {
      let end = 0;
      for (const item of spans) {
        if (item.offset < end || text.slice(end, item.offset).trim()) throw invalid();
        end = item.end;
      }
      if (text.slice(end).trim()) throw invalid();
    }
    if (sentences.some((s, i) => i > 0 && s.offset < sentences[i - 1]!.end)
      || tokens.some((t, i) => owners[i]! < 0 || t.head >= tokens.length || owners[t.head] !== owners[i]
        || (i > 0 && t.offset < tokens[i - 1]!.end))) throw invalid();
    const mapped = sentences.map((sentence, sentenceIndex) => {
      const first = owners.indexOf(sentenceIndex), count = owners.filter(i => i === sentenceIndex).length;
      if (first < 0) throw invalid();
      return { id: `${sourceIndex + 1}:${sentenceIndex}`, sourceIndex, text: sentence.text,
        tokens: tokens.slice(first, first + count).map(t => ({ text: t.text, offset: t.offset - sentence.offset,
          pos: t.pos, head: t.head - first, relation: t.relation })) };
    });
    if (sourceIndices.includes(sourceIndex)) result.set(sourceIndex, mapped);
  });
  return sourceIndices.flatMap(i => result.get(i)!);
}

export function partOfSpeechName(tag: string, language: 'ko' | 'en' = 'ko'): string {
  if (language === 'en') {
    const names: Record<string, string> = { ADJ: 'adjective', ADP: 'preposition', ADV: 'adverb', CONJ: 'conjunction',
      DET: 'determiner', NOUN: 'noun', NUM: 'numeral', PRON: 'pronoun', PRT: 'particle', PUNCT: 'punctuation',
      VERB: 'verb', X: 'other', UNKNOWN: 'unknown' };
    return Object.hasOwn(names, tag) ? names[tag]! : tag.toLowerCase();
  }
  const names: Record<string, string> = { ADJ: '형용사', ADP: '전치사', ADV: '부사', CONJ: '접속사',
    DET: '한정사', NOUN: '명사', NUM: '수사', PRON: '대명사', PRT: '불변화사', PUNCT: '문장 부호',
    VERB: '동사', X: '기타', UNKNOWN: '품사 정보 없음' };
  return names[tag] ?? tag;
}
