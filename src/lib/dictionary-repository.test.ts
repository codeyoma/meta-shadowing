// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, query, response } = vi.hoisted(() => {
  const response = { data: [] as unknown[], error: null as unknown };
  const query = {
    select: vi.fn(), eq: vi.fn(), contains: vi.fn(), overlaps: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn()
  };
  return { createClient: vi.fn(), query, response };
});
vi.mock("server-only", () => ({}));
vi.mock("./supabase/secret", () => ({ createSecretSupabaseClient: createClient }));
import { lookupDictionaryEntries } from "./dictionary-repository";

beforeEach(() => {
  vi.resetAllMocks();
  response.data = [];
  response.error = null;
  createClient.mockReturnValue({ from: vi.fn(() => query) });
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.contains.mockReturnValue(query);
  query.overlaps.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.abortSignal.mockImplementation(async () => response);
});

describe("private dictionary repository", () => {
  const englishEntry = (headword: string, pos = "verb") => ({
    headword, language: "en", pos, senses: [{ glosses: ["테스트 뜻"] }],
    sourceUrl: `https://ko.wiktionary.org/wiki/${headword}`, license: "CC BY-SA 4.0"
  });
  it("resolves passed through pass without replacing its verb meaning with noun senses", async () => {
    const verb = englishEntry("pass");
    query.abortSignal.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ entry: englishEntry("pass", "noun") }, { entry: verb }], error: null });
    expect(await lookupDictionaryEntries("en", "passed")).toEqual([{ ...verb, matchType: "lemma" }]);
    expect(query.contains).toHaveBeenCalledWith("lookup_keys", ["passed"]);
    expect(query.overlaps).toHaveBeenCalledWith("lookup_keys", ["pass"]);
  });
  it("keeps saw's direct meaning first and also offers see as a verb base", async () => {
    const direct = englishEntry("saw", "noun");
    const base = englishEntry("see");
    query.abortSignal.mockResolvedValueOnce({ data: [{ entry: direct }], error: null }).mockResolvedValueOnce({ data: [{ entry: base }], error: null });
    expect(await lookupDictionaryEntries("en", "saw")).toEqual([direct, { ...base, matchType: "lemma" }]);
  });
  it("does not replace an existing uninflected noun with a guessed noun root", async () => {
    const direct = englishEntry("boss", "noun");
    response.data = [{ entry: direct }];
    expect(await lookupDictionaryEntries("en", "boss")).toEqual([direct]);
    expect(query.overlaps).not.toHaveBeenCalled();
  });
  it("offers the adjective base even when a comparative has its own noun entry", async () => {
    const direct = englishEntry("better", "noun");
    const base = englishEntry("good", "adj");
    query.abortSignal.mockResolvedValueOnce({ data: [{ entry: direct }], error: null })
      .mockResolvedValueOnce({ data: [{ entry: base }], error: null });
    expect(await lookupDictionaryEntries("en", "better")).toEqual([direct, { ...base, matchType: "lemma" }]);
  });
  it("returns no match if candidate headwords are also missing", async () => {
    expect(await lookupDictionaryEntries("en", "passed")).toEqual([]);
    expect(query.overlaps).toHaveBeenCalledTimes(1);
  });
  it("keeps a valid direct entry if the optional lemma query fails", async () => {
    const direct = englishEntry("saw", "noun");
    query.abortSignal.mockResolvedValueOnce({ data: [{ entry: direct }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "temporary failure" } });
    expect(await lookupDictionaryEntries("en", "saw")).toEqual([direct]);
  });
  it("does not query the same base twice when a stored form alias already found it", async () => {
    const direct = englishEntry("pass");
    response.data = [{ entry: direct }];
    expect(await lookupDictionaryEntries("en", "passed")).toEqual([direct]);
    expect(query.overlaps).not.toHaveBeenCalled();
  });
  it("queries only the selected language with a normalized exact key, response limit, and timeout", async () => {
    const entry = { headword: "école", language: "fr", pos: "noun", senses: [{ glosses: ["학교"] }],
      sourceUrl: "https://ko.wiktionary.org/wiki/%C3%A9cole", license: "CC BY-SA 4.0" };
    response.data = [{ entry }];
    expect(await lookupDictionaryEntries("fr", "ÉCOLE")).toEqual([entry]);
    expect(query.eq).toHaveBeenCalledWith("language", "fr");
    expect(query.contains).toHaveBeenCalledWith("lookup_keys", ["école"]);
    expect(query.limit).toHaveBeenCalledWith(12);
    expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("does not silently return no matches when storage is unavailable, errors, or contains invalid entries", async () => {
    createClient.mockReturnValueOnce(null);
    await expect(lookupDictionaryEntries("en", "school")).rejects.toThrow("unavailable");
    response.error = { message: "sensitive database response" };
    await expect(lookupDictionaryEntries("en", "school")).rejects.toThrow("Dictionary lookup failed.");
    response.error = null;
    response.data = [{ entry: {} }];
    await expect(lookupDictionaryEntries("en", "school")).rejects.toThrow("Dictionary entry is invalid.");
  });
});
