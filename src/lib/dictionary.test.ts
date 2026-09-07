import { describe, expect, it } from "vitest";
import { decodeDictionaryEntry, normalizeDictionaryLookup, parseDictionaryLanguage, parseDictionaryWord } from "./dictionary";

describe("dictionary lookup keys", () => {
  it("normalizes fullwidth/case and apostrophes while preserving meaningful accents", () => {
    expect(normalizeDictionaryLookup("  ＨＥＬＬＯ  ")).toBe("hello");
    expect(normalizeDictionaryLookup("L’ÉCOLE")).toBe("l'école");
    expect(normalizeDictionaryLookup("e\u0301cole")).toBe("école");
    expect(normalizeDictionaryLookup("学校")).toBe("学校");
    expect(normalizeDictionaryLookup("schön")).not.toBe("schon");
  });

  it.each(["english", "EN", "japanese", "ja", "chinese", "zh", "spanish", "es", "german", "de", "french", "fr"])("accepts supported language %s", (language) => {
    expect(parseDictionaryLanguage(language)).not.toBeNull();
  });

  it.each(["ko", "korean", "__proto__", "constructor", "", null])("rejects unsupported language %s", (language) => {
    expect(parseDictionaryLanguage(language)).toBeNull();
  });

  it.each(["학교", "公平", "l'école", "Mother-in-law", "café", "𠮷".repeat(80)])("accepts bounded Unicode words %s", (word) => {
    expect(parseDictionaryWord(word)).toBe(word);
  });

  it.each(["", "  ", "!!!", "hello%", "a,b", "hello\n", "a\u0000b", "a\u202Eb", "𠮷".repeat(81), "a".repeat(81), "1"])("rejects invalid or oversized lookup %s", (word) => {
    expect(parseDictionaryWord(word)).toBeNull();
  });
});

describe("stored dictionary entries", () => {
  const entry = {
    headword: "school", language: "en", pos: "noun", senses: [{ glosses: ["학교"] }],
    sourceUrl: "https://ko.wiktionary.org/wiki/school", license: "CC BY-SA 4.0"
  };

  it("preserves attribution and omits unrelated database fields", () => {
    expect(decodeDictionaryEntry({ ...entry, privateValue: "not-for-browser" }, "en")).toEqual(entry);
  });

  it("fails closed for an invalid language, source URL, license, or absent definition", () => {
    expect(decodeDictionaryEntry(entry, "ja")).toBeNull();
    expect(decodeDictionaryEntry({ ...entry, sourceUrl: "javascript:alert(1)" }, "en")).toBeNull();
    expect(decodeDictionaryEntry({ ...entry, license: "MIT" }, "en")).toBeNull();
    expect(decodeDictionaryEntry({ ...entry, senses: [{ glosses: [] }] }, "en")).toBeNull();
  });

  it("bounds unusually large stored senses and example text", () => {
    const decoded = decodeDictionaryEntry({ ...entry, senses: Array.from({ length: 100 }, () => ({
      glosses: Array.from({ length: 20 }, () => "뜻".repeat(3000)),
      examples: [{ text: "a".repeat(2000), translation: "번역" }]
    })) }, "en");
    expect(decoded?.senses).toHaveLength(32);
    expect(decoded?.senses[0].glosses).toHaveLength(8);
    expect(decoded?.senses[0].glosses[0]).toHaveLength(2000);
    expect(decoded?.senses[0].examples?.[0].text).toHaveLength(1000);
  });
});
