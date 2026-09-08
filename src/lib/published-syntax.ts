import "server-only";
import type { PhraseSyntax, SentenceAnalysis, SyntaxToken } from "./phrase-syntax";
import { createSecretSupabaseClient } from "./supabase/secret";

type AnalysisRow = {
  sentence_number: number; begin_offset: number; text_content: string; language_code: string;
  status: SentenceAnalysis["status"]; response: unknown;
};

function readTokens(value: unknown, text: string): SyntaxToken[] {
  const tokens = value && typeof value === "object" && "tokens" in value ? value.tokens : null;
  if (!Array.isArray(tokens) || !tokens.length) throw new Error("Invalid stored analysis.");
  return tokens.map((token: SyntaxToken) => {
    if (!token || typeof token.text?.content !== "string" || !token.text.content
      || !Number.isInteger(token.text.beginOffset) || token.text.beginOffset < 0
      || text.slice(token.text.beginOffset, token.text.beginOffset + token.text.content.length) !== token.text.content
      || typeof token.lemma !== "string" || typeof token.partOfSpeech?.tag !== "string"
      || typeof token.dependencyEdge?.label !== "string" || !Number.isInteger(token.dependencyEdge.headTokenIndex)
      || token.dependencyEdge.headTokenIndex < 0 || token.dependencyEdge.headTokenIndex >= tokens.length) {
      throw new Error("Invalid stored analysis.");
    }
    return {
      text: { content: token.text.content, beginOffset: token.text.beginOffset }, lemma: token.lemma,
      partOfSpeech: { tag: token.partOfSpeech.tag, ...Object.fromEntries(Object.entries(token.partOfSpeech)
        .filter(([, value]) => typeof value === "string" && !value.endsWith("_UNKNOWN"))) },
      dependencyEdge: { label: token.dependencyEdge.label, headTokenIndex: token.dependencyEdge.headTokenIndex }
    };
  });
}

export async function getPublishedPhraseSyntax(lessonId: string, phraseNumber: number, version: string): Promise<PhraseSyntax> {
  const supabase = createSecretSupabaseClient();
  if (!supabase) throw new Error("Sentence analysis unavailable.");
  // Filter the joined view in the same query: a learner can never retrieve a
  // draft, replaced version, or another book's analysis by guessing a draft ID.
  const { data, error } = await supabase.from("lesson_sentence_analysis")
    .select("sentence_number, begin_offset, text_content, language_code, status, response")
    .eq("lesson_id", lessonId).eq("publication_status", "published").eq("published_at", version)
    .eq("phrase_number", phraseNumber).order("sentence_number")
    .abortSignal(AbortSignal.timeout(10_000));
  if (error || !data) throw new Error("Sentence analysis read failed.");
  return { phraseNumber, sentences: (data as AnalysisRow[]).map(row => ({
    sentenceNumber: row.sentence_number, beginOffset: row.begin_offset, text: row.text_content,
    language: row.language_code, status: row.status,
    tokens: row.status === "complete" ? readTokens(row.response, row.text_content) : []
  })) };
}
