import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminIdentity } from "./admin-auth";
import { readAdminTestEnvironment } from "./admin-test-mode";
import { analyzeSentence, hasGoogleSyntaxCredentials, SyntaxProviderError, type GoogleSyntaxResponse } from "./google-syntax";
import type { LessonDraftEntry } from "./lesson-draft-parser";
import { lessonSentences, syntaxUnits, type SyntaxLanguage, type SyntaxProgress, type SyntaxState } from "./sentence-syntax";
import { createSecretSupabaseClient } from "./supabase/secret";

const ANALYZER_VERSION = "google-v1-utf16";
type SyntaxRow = {
  id: string; draft_id: string; text_content: string; text_hash: string;
  language_code: SyntaxLanguage; analyzer_version: string; status: SyntaxState;
  lease_id: string; error_code: string | null;
};
type OwnedDraft = { id: string; lesson_id: string; language: string; parsed_entries: LessonDraftEntry[]; deletion_started_at: string | null };
export class SyntaxStorageError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function database() {
  const client = createSecretSupabaseClient();
  if (!client) throw new SyntaxStorageError(503, "서버 데이터베이스 설정을 확인해 주세요.");
  return client;
}
function checkStorage(error: unknown) {
  if (error) throw new SyntaxStorageError(503, "구문 분석 저장소에 연결하지 못했습니다. 데이터베이스 마이그레이션과 연결 상태를 확인해 주세요.");
}
async function ownedDraft(client: SupabaseClient, admin: AdminIdentity, draftId: string): Promise<OwnedDraft> {
  const { data, error } = await client.from("lesson_drafts")
    .select("id, lesson_id, language, parsed_entries, deletion_started_at")
    .eq("id", draftId).eq("created_by", admin.id).maybeSingle();
  checkStorage(error);
  if (!data || data.deletion_started_at) throw new SyntaxStorageError(404, "분석할 초안을 찾을 수 없습니다.");
  if (data.lesson_id !== data.id) {
    const root = await client.from("lesson_drafts").select("deletion_started_at").eq("id", data.lesson_id).maybeSingle();
    checkStorage(root.error);
    if (!root.data || root.data.deletion_started_at) throw new SyntaxStorageError(409, "삭제 중인 레슨은 분석할 수 없습니다.");
  }
  return data as OwnedDraft;
}

async function seedSentences(client: SupabaseClient, draft: OwnedDraft) {
  const rows = lessonSentences(draft.parsed_entries, draft.language).map(sentence => ({
    draft_id: draft.id, phrase_number: sentence.phraseNumber, sentence_number: sentence.sentenceNumber,
    begin_offset: sentence.beginOffset, text_content: sentence.text, language_code: sentence.languageCode,
    text_hash: createHash("sha256").update(sentence.text).digest("hex"), analyzer_version: ANALYZER_VERSION
  }));
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error } = await client.from("lesson_sentence_syntax").upsert(rows.slice(offset, offset + 250), {
      onConflict: "draft_id,phrase_number,sentence_number", ignoreDuplicates: true
    });
    checkStorage(error);
  }
}

const emptyProgress = (): SyntaxProgress => ({
  configured: hasGoogleSyntaxCredentials(), total: 0, complete: 0, pending: 0, processing: 0, failed: 0, estimatedUnits: 0, errors: []
});
async function progress(client: SupabaseClient, draft: OwnedDraft): Promise<SyntaxProgress> {
  const result = emptyProgress();
  const sentences = lessonSentences(draft.parsed_entries, draft.language);
  result.total = sentences.length;
  result.estimatedUnits = sentences.reduce((sum, sentence) => sum + syntaxUnits(sentence.text), 0);
  let stored = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("lesson_sentence_syntax").select("status,error_code")
      .eq("draft_id", draft.id).order("phrase_number").order("sentence_number").range(offset, offset + 499);
    checkStorage(error);
    for (const row of data ?? []) {
      result[row.status as SyntaxState]++;
      if (row.error_code && !result.errors.includes(row.error_code)) result.errors.push(row.error_code);
    }
    stored += data?.length ?? 0;
    if (!data || data.length < 500) break;
  }
  // A draft survives even if seeding failed. The next POST inserts missing rows.
  result.pending += Math.max(0, sentences.length - stored);
  return result;
}

export async function prepareSentenceSyntax(admin: AdminIdentity, draftId: string): Promise<void> {
  if (readAdminTestEnvironment()) return;
  const client = database();
  await seedSentences(client, await ownedDraft(client, admin, draftId));
}

export async function getSentenceSyntaxProgress(admin: AdminIdentity, draftId: string): Promise<SyntaxProgress> {
  if (readAdminTestEnvironment()) return { ...emptyProgress(), configured: false };
  const client = database();
  return progress(client, await ownedDraft(client, admin, draftId));
}

async function cachedAnalysis(client: SupabaseClient, row: SyntaxRow): Promise<GoogleSyntaxResponse | null> {
  const { data, error } = await client.from("lesson_sentence_syntax").select("response")
    .eq("status", "complete").eq("language_code", row.language_code).eq("text_hash", row.text_hash)
    .eq("text_content", row.text_content).eq("analyzer_version", ANALYZER_VERSION).limit(1);
  checkStorage(error);
  return data?.[0]?.response as GoogleSyntaxResponse | null ?? null;
}

async function processRows(client: SupabaseClient, rows: SyntaxRow[]) {
  const inFlight = new Map<string, Promise<GoogleSyntaxResponse>>();
  async function processOne(row: SyntaxRow) {
    let response: GoogleSyntaxResponse;
    try {
      const key = `${row.language_code}:${row.text_hash}`;
      let analysis = inFlight.get(key);
      if (!analysis) {
        analysis = (async () => await cachedAnalysis(client, row) ?? await analyzeSentence(row.text_content, row.language_code))();
        inFlight.set(key, analysis);
      }
      response = await analysis;
    } catch (error) {
      if (error instanceof SyntaxStorageError) throw error;
      const { error: saveError } = await client.from("lesson_sentence_syntax").update({
        status: "failed", error_code: error instanceof SyntaxProviderError ? error.code : "analysis-failed", lease_id: null
      }).eq("id", row.id).eq("lease_id", row.lease_id).eq("status", "processing");
      checkStorage(saveError);
      return;
    }
    const { error } = await client.from("lesson_sentence_syntax").update({
      status: "complete", response, completed_at: new Date().toISOString(), error_code: null, lease_id: null
    }).eq("id", row.id).eq("lease_id", row.lease_id).eq("status", "processing");
    checkStorage(error);
  }
  // Six requests per batch, at most three concurrent Google calls. Each round
  // allows up to 10 seconds for authentication and 12 seconds for analysis.
  for (let offset = 0; offset < rows.length; offset += 3) {
    await Promise.all(rows.slice(offset, offset + 3).map(processOne));
  }
}

export async function runSentenceSyntaxBatch(admin: AdminIdentity, draftId: string, retryFailed = false): Promise<SyntaxProgress> {
  if (readAdminTestEnvironment()) return { ...emptyProgress(), configured: false };
  const client = database();
  const draft = await ownedDraft(client, admin, draftId);
  await seedSentences(client, draft);
  if (!hasGoogleSyntaxCredentials()) return progress(client, draft);
  if (retryFailed) {
    const { error } = await client.from("lesson_sentence_syntax").update({ status: "pending", error_code: null })
      .eq("draft_id", draftId).eq("status", "failed");
    checkStorage(error);
  }
  const { data, error } = await client.rpc("claim_sentence_syntax", { p_draft_id: draftId, p_limit: 6 });
  checkStorage(error);
  await processRows(client, (data ?? []) as SyntaxRow[]);
  return progress(client, draft);
}
