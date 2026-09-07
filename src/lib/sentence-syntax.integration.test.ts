// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { AdminIdentity } from "./admin-auth";
import type { GoogleSyntaxResponse } from "./google-syntax";
import type { LessonDraftEntry } from "./lesson-draft-parser";

const { analyze } = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./admin-test-mode", () => ({ readAdminTestEnvironment: () => null }));
vi.mock("./google-syntax", async (importOriginal) => ({
  ...await importOriginal<typeof import("./google-syntax")>(),
  analyzeSentence: analyze,
  hasGoogleSyntaxCredentials: () => true
}));

import {
  getSentenceSyntaxProgress, prepareSentenceSyntax, runSentenceSyntaxBatch
} from "./sentence-syntax-repository";

function providerResponse(text: string, language: string): GoogleSyntaxResponse {
  return {
    language,
    sentences: [{ text: { content: text, beginOffset: 0 } }],
    tokens: [...text.matchAll(/\S+/g)].map((match, index) => ({
      text: { content: match[0], beginOffset: match.index },
      lemma: match[0].toLowerCase(), partOfSpeech: { tag: "NOUN", number: "SINGULAR" },
      dependencyEdge: { headTokenIndex: 0, label: index === 0 ? "ROOT" : "DEP" }
    }))
  };
}

/** Opt-in only: obtain all three dedicated variables from `supabase status -o env`.
 * Never fall back to the application's .env.local, which may point at a hosted project.
 */
it.skipIf(process.env.SYNTAX_SUPABASE_INTEGRATION !== "1")(
  "persists actual local syntax rows, UTF16 offsets and raw provider JSON, then reuses completed results",
  async () => {
    const url = process.env.SUPABASE_INTEGRATION_URL;
    const publishable = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_INTEGRATION_SECRET_KEY;
    if (!url || !publishable || !secret) throw new Error("Explicit local syntax integration settings are required.");
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname)) {
      throw new Error("Syntax integration fixtures may only use the local Supabase stack.");
    }
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishable);
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const nonce = randomUUID();
    const draftId = randomUUID();
    const email = `syntax-integration-${nonce}@example.com`;
    let admin: AdminIdentity | null = null;
    let draftCreated = false;
    const first = `  😀 Alpha ${nonce}! Beta ${nonce}?\r\n  Gamma ${nonce}.`;
    const second = `Delta ${nonce}. Epsilon ${nonce}! Zeta ${nonce}? Eta ${nonce}.`;
    const repeated = `😀 Alpha ${nonce}!`;
    const entries: LessonDraftEntry[] = [first, second, repeated].map((target, index) => ({
      kind: "phrase", sourceLine: index + 1, phraseNumber: index + 1, target, korean: "로컬 통합 테스트"
    }));
    const expected = [
      { phrase: 1, sentence: 1, text: repeated, offset: 2 },
      { phrase: 1, sentence: 2, text: `Beta ${nonce}?`, offset: first.indexOf("Beta") },
      { phrase: 1, sentence: 3, text: `Gamma ${nonce}.`, offset: first.indexOf("Gamma") },
      { phrase: 2, sentence: 1, text: `Delta ${nonce}.`, offset: 0 },
      { phrase: 2, sentence: 2, text: `Epsilon ${nonce}!`, offset: second.indexOf("Epsilon") },
      { phrase: 2, sentence: 3, text: `Zeta ${nonce}?`, offset: second.indexOf("Zeta") },
      { phrase: 2, sentence: 4, text: `Eta ${nonce}.`, offset: second.indexOf("Eta") },
      { phrase: 3, sentence: 1, text: repeated, offset: 0 }
    ];

    try {
      const created = await client.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
      if (created.error || !created.data.user) throw new Error("Local syntax fixture administrator could not be created.");
      admin = { id: created.data.user.id, email };
      const draft = await client.from("lesson_drafts").insert({
        id: draftId, created_by: admin.id, title: `Syntax integration ${nonce}`, language: "english",
        target_filename: "syntax-target.txt", korean_filename: "syntax-ko.txt",
        target_source: [first, second, repeated].join("\n"), korean_source: "로컬 통합 테스트",
        parsed_entries: entries, validation_issues: [], validation_status: "validated",
        phrase_count: 3, chapter_count: 0, section_count: 0
      });
      if (draft.error) throw new Error("Local syntax fixture draft could not be created.");
      draftCreated = true;
      analyze.mockReset();
      analyze.mockImplementation(async (text: string, language: string) => providerResponse(text, language));

      await prepareSentenceSyntax(admin, draftId);
      expect(await getSentenceSyntaxProgress(admin, draftId)).toMatchObject({
        configured: true, total: 8, pending: 8, processing: 0, complete: 0, failed: 0, estimatedUnits: 8
      });
      const pending = await client.from("lesson_sentence_syntax")
        .select("phrase_number,sentence_number,begin_offset,text_content,response,status")
        .eq("draft_id", draftId).order("phrase_number").order("sentence_number");
      if (pending.error) throw new Error("Prepared local syntax rows could not be read.");
      expect(pending.data).toEqual(expected.map((item) => ({
        phrase_number: item.phrase, sentence_number: item.sentence, begin_offset: item.offset,
        text_content: item.text, response: null, status: "pending"
      })));

      // A different administrator identity must not seed or bill work for this fixture.
      await expect(runSentenceSyntaxBatch({ id: randomUUID(), email: "other@example.com" }, draftId))
        .rejects.toMatchObject({ status: 404 });
      expect(analyze).not.toHaveBeenCalled();

      expect(await runSentenceSyntaxBatch(admin, draftId)).toMatchObject({ total: 8, complete: 6, pending: 2, processing: 0, failed: 0 });
      expect(analyze).toHaveBeenCalledTimes(6);
      expect(await runSentenceSyntaxBatch(admin, draftId)).toMatchObject({ total: 8, complete: 8, pending: 0, processing: 0, failed: 0 });
      // The repeated sentence in the second batch must reuse the first batch's stored JSON.
      expect(analyze).toHaveBeenCalledTimes(7);
      const stored = await client.from("lesson_sentence_syntax")
        .select("phrase_number,sentence_number,begin_offset,text_content,response,status,attempts,lease_id,completed_at")
        .eq("draft_id", draftId).order("phrase_number").order("sentence_number");
      if (stored.error) throw new Error("Completed local syntax rows could not be read.");
      expect(stored.data).toHaveLength(8);
      for (let index = 0; index < expected.length; index += 1) {
        const item = expected[index];
        const row = stored.data[index];
        expect(row).toMatchObject({
          phrase_number: item.phrase, sentence_number: item.sentence, begin_offset: item.offset,
          text_content: item.text, status: "complete", attempts: 1, lease_id: null,
          response: providerResponse(item.text, "en")
        });
        expect(row.completed_at).toEqual(expect.any(String));
        const target = [first, second, repeated][item.phrase - 1];
        expect(target.slice(row.begin_offset, row.begin_offset + row.text_content.length)).toBe(item.text);
      }

      await prepareSentenceSyntax(admin, draftId);
      expect(await runSentenceSyntaxBatch(admin, draftId, true)).toMatchObject({ total: 8, complete: 8, pending: 0, failed: 0 });
      expect(analyze).toHaveBeenCalledTimes(7);
      const unchanged = await client.from("lesson_sentence_syntax")
        .select("id,attempts").eq("draft_id", draftId);
      if (unchanged.error) throw new Error("Repeated local syntax run could not be verified.");
      expect(unchanged.data).toHaveLength(8);
      expect(unchanged.data.every((row) => row.attempts === 1)).toBe(true);
    } finally {
      // Every mutation is scoped to IDs created by this test; no reset, truncate or broad delete.
      try {
        if (draftCreated) {
          const removed = await client.from("lesson_drafts").delete().eq("id", draftId);
          if (removed.error) throw new Error("Local syntax fixture draft cleanup failed.");
          const remaining = await client.from("lesson_sentence_syntax").select("id").eq("draft_id", draftId);
          if (remaining.error || remaining.data.length) throw new Error("Local syntax rows did not cascade away during fixture cleanup.");
        }
      } finally {
        try {
          if (admin) {
            const removed = await client.auth.admin.deleteUser(admin.id);
            if (removed.error) throw new Error("Local syntax fixture administrator cleanup failed.");
          }
        } finally { vi.unstubAllEnvs(); }
      }
    }
  },
  30_000
);
