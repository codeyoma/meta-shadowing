// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { client, query, result } = vi.hoisted(() => ({
  client: vi.fn(), query: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), abortSignal: vi.fn() },
  result: { data: [] as unknown[], error: null as unknown }
}));
vi.mock("server-only", () => ({}));
vi.mock("./supabase/secret", () => ({ createSecretSupabaseClient: client }));
import { getPublishedPhraseSyntax } from "./published-syntax";
const version = "2026-09-06T14:56:09.015164+00:00";
const token = { text: { content: "passed", beginOffset: 0 }, lemma: "pass", partOfSpeech: { tag: "VERB", tense: "PAST", number: "NUMBER_UNKNOWN" }, dependencyEdge: { headTokenIndex: 0, label: "ROOT" } };
const row = { sentence_number: 2, begin_offset: 17, text_content: "passed", language_code: "en", status: "complete", response: { tokens: [token] }, error_code: "private", lease_id: "private" };
beforeEach(() => {
  vi.resetAllMocks(); result.data = [row]; result.error = null;
  client.mockReturnValue({ from: vi.fn(() => query) });
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
  query.abortSignal.mockImplementation(async () => result);
});

it("reads only the published book, exact version and phrase, preserving sentence offsets and lemma", async () => {
  const data = await getPublishedPhraseSyntax("book", 7, version);
  expect(query.eq.mock.calls).toEqual([["lesson_id", "book"], ["publication_status", "published"], ["published_at", version], ["phrase_number", 7]]);
  expect(query.order).toHaveBeenCalledWith("sentence_number");
  expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(data).toEqual({ phraseNumber: 7, sentences: [{ sentenceNumber: 2, beginOffset: 17, text: "passed", language: "en", status: "complete",
    tokens: [{ ...token, partOfSpeech: { tag: "VERB", tense: "PAST" } }] }] });
  expect(JSON.stringify(data)).not.toContain("private");
});

it("does not return partial results for uncompleted sentences or silently lose their numbering", async () => {
  result.data = [{ ...row, status: "failed", response: { tokens: [token] } }, { ...row, sentence_number: 3, status: "processing", response: null }];
  expect((await getPublishedPhraseSyntax("book", 7, version)).sentences).toMatchObject([
    { sentenceNumber: 2, status: "failed", tokens: [] }, { sentenceNumber: 3, status: "processing", tokens: [] }
  ]);
});

it("returns no analysis for a version filtered out by the view", async () => {
  result.data = [];
  expect(await getPublishedPhraseSyntax("book", 7, version)).toEqual({ phraseNumber: 7, sentences: [] });
});

it.each([
  null, { tokens: [] }, { tokens: [null] },
  { tokens: [{ ...token, text: { content: "wrong", beginOffset: 0 } }] },
  { tokens: [{ ...token, dependencyEdge: { headTokenIndex: 1, label: "NSUBJ" } }] }
])("rejects invalid stored tokens instead of misrepresenting word relationships", async response => {
  result.data = [{ ...row, response }];
  await expect(getPublishedPhraseSyntax("book", 7, version)).rejects.toThrow("Invalid stored analysis.");
});

it("distinguishes storage failure from an absent analysis without exposing database errors", async () => {
  result.error = { message: "private detail" };
  await expect(getPublishedPhraseSyntax("book", 7, version)).rejects.toThrow("Sentence analysis read failed.");
  client.mockReturnValue(null);
  await expect(getPublishedPhraseSyntax("book", 7, version)).rejects.toThrow("Sentence analysis unavailable.");
});
