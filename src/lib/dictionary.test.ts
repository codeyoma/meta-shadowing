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

  it("preserves explicit entry and sense transitivity while omitting absent or unknown metadata", () => {
    const decoded = decodeDictionaryEntry({ ...entry, pos: "verb", tags: ["transitive", "transitive", "rare", "intransitive"],
      senses: [{ glosses: ["버티다, 참다, 인내하다."], tags: ["intransitive"] },
        { glosses: ["지다."], tags: ["transitive"] },
        { glosses: ["자동사, 타동사라는 단어를 포함한 설명"], tags: ["guess-transitive"], examples: [{ text: "She passes me." }] }] }, "en");
    expect(decoded?.tags).toEqual(["transitive", "intransitive"]);
    expect(decoded?.senses.map(sense => sense.tags)).toEqual([["intransitive"], ["transitive"], undefined]);
    expect(decodeDictionaryEntry(entry, "en")).not.toHaveProperty("tags");
    expect(decodeDictionaryEntry({ ...entry, tags: "transitive" }, "en")).not.toHaveProperty("tags");
  });

  it("accepts exact Korean Wiktionary revision provenance and rejects other titles or query actions", () => {
    const revision = { ...entry, sourceUrl: "https://ko.wiktionary.org/w/index.php?title=school&oldid=1234" };
    expect(decodeDictionaryEntry(revision, "en")).toEqual(revision);
    expect(decodeDictionaryEntry({ ...revision, sourceUrl: revision.sourceUrl + "&action=edit" }, "en")).toBeNull();
    expect(decodeDictionaryEntry({ ...revision, sourceUrl: revision.sourceUrl.replace("title=school", "title=other") }, "en")).toBeNull();
  });

  it("fails closed for an invalid language, source URL, license, or absent definition", () => {
    expect(decodeDictionaryEntry(entry, "ja")).toBeNull();
    expect(decodeDictionaryEntry({ ...entry, sourceUrl: "javascript:alert(1)" }, "en")).toBeNull();
    expect(decodeDictionaryEntry({ ...entry, license: "MIT" }, "en")).toBeNull();
    expect(decodeDictionaryEntry({ ...entry, senses: [{ glosses: [] }] }, "en")).toBeNull();
  });

  it("preserves all stored meanings and examples beyond the former display caps", () => {
    const complete = { ...entry, senses: Array.from({ length: 33 }, (_, index) => ({
      glosses: [`뜻 ${index}`, ...Array.from({ length: 8 }, () => "추가 뜻")],
      examples: Array.from({ length: 5 }, () => ({ text: "a".repeat(1100), translation: "번역" }))
    })) };
    expect(decodeDictionaryEntry(complete, "en")).toEqual(complete);
  });

  it("rejects an oversized stored entry rather than silently shortening its meaning", () => {
    expect(decodeDictionaryEntry({ ...entry, senses: [{ glosses: ["뜻".repeat(100000)] }] }, "en")).toBeNull();
  });
});
