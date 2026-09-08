// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, query, response } = vi.hoisted(() => {
  const response = { data: [] as unknown[], error: null as unknown };
  const query = {
    select: vi.fn(), eq: vi.fn(), contains: vi.fn(), overlaps: vi.fn(), order: vi.fn(), limit: vi.fn(), range: vi.fn(), abortSignal: vi.fn()
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
  query.range.mockReturnValue(query);
  query.abortSignal.mockImplementation(async () => response);
});

describe("private dictionary repository", () => {
  const englishEntry = (headword: string, pos = "verb") => ({
    headword, language: "en", pos, senses: [{ glosses: ["테스트 뜻"] }],
    sourceUrl: `https://ko.wiktionary.org/wiki/${headword}`, license: "CC BY-SA 4.0"
  });
  it("resolves passed to pass and includes every part of speech of the resolved word", async () => {
    const verb = englishEntry("pass");
    const noun = englishEntry("pass", "noun");
    query.abortSignal.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ entry: noun }, { entry: verb }], error: null });
    expect(await lookupDictionaryEntries("en", "passed")).toEqual([{ ...noun, matchType: "lemma" }, { ...verb, matchType: "lemma" }]);
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
  it("completes all parts of speech when only one entry stores the selected inflection alias", async () => {
    const direct = englishEntry("pass");
    const noun = englishEntry("pass", "noun");
    query.abortSignal.mockResolvedValueOnce({ data: [{ entry: direct }], error: null })
      .mockResolvedValueOnce({ data: [{ entry: direct }, { entry: noun }], error: null });
    expect(await lookupDictionaryEntries("en", "passed")).toEqual([direct, noun]);
  });
  it("queries only the selected language with a normalized exact key and timeout", async () => {
    const entry = { headword: "école", language: "fr", pos: "noun", senses: [{ glosses: ["학교"] }],
      sourceUrl: "https://ko.wiktionary.org/wiki/%C3%A9cole", license: "CC BY-SA 4.0" };
    response.data = [{ entry }];
    expect(await lookupDictionaryEntries("fr", "ÉCOLE")).toEqual([entry]);
    expect(query.eq).toHaveBeenCalledWith("language", "fr");
    expect(query.contains).toHaveBeenCalledWith("lookup_keys", ["école"]);
    expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("returns every direct entry across storage pages without the former twelve-entry cap", async () => {
    const entries = Array.from({ length: 51 }, (_, index) => ({ ...englishEntry("test"), senses: [{ glosses: [`의미 ${index}`] }] }));
    query.abortSignal.mockResolvedValueOnce({ data: entries.slice(0, 50).map(entry => ({ entry })), error: null })
      .mockResolvedValueOnce({ data: [{ entry: entries[50] }], error: null });
    expect(await lookupDictionaryEntries("en", "test")).toEqual(entries);
  });

  it("fails explicitly when the complete result exceeds the entry or byte budget", async () => {
    response.data = Array.from({ length: 50 }, (_, index) => ({ entry: { ...englishEntry("test"), senses: [{ glosses: [`의미 ${index}`] }] } }));
    await expect(lookupDictionaryEntries("en", "test")).rejects.toThrow("response budget");
    response.data = Array.from({ length: 10 }, () => ({ entry: { ...englishEntry("test"), senses: [{ glosses: ["뜻".repeat(40000)] }] } }));
    await expect(lookupDictionaryEntries("en", "test")).rejects.toThrow("response budget");
  });

  it("requires a compatible POS to establish a guessed base before expanding all its uses", async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ entry: englishEntry("pass", "noun") }], error: null });
    expect(await lookupDictionaryEntries("en", "passed")).toEqual([]);
  });

  it("does not call a failed inflection expansion a complete direct result", async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [{ entry: englishEntry("pass") }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(lookupDictionaryEntries("en", "passed")).rejects.toThrow("Dictionary lookup failed");
  });

  it("reports an oversized optional base entry instead of silently falling back to the direct word", async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [{ entry: englishEntry("saw", "noun") }], error: null })
      .mockResolvedValueOnce({ data: [{ entry: { ...englishEntry("see"), senses: [{ glosses: ["뜻".repeat(100000)] }] } }], error: null });
    await expect(lookupDictionaryEntries("en", "saw")).rejects.toThrow("budget");
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
