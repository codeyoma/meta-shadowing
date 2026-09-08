// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Standalone maintenance CLI exports its import seam for verification.
import { importKoreanWiktionarySupplements, parseSupplementArguments, supplementKoreanWiktionaryPage } from "../../scripts/supplement-kowiktionary.mjs";

describe("Korean Wiktionary unheaded-definition supplement", () => {
  it("recovers only the missing noun block and retains source revision attribution", () => {
    // Minimal source-shaped extract of respect revision 4365701, CC BY-SA 4.0.
    const page = { title: "respect", revid: 4365701,
      categories: [{ category: "영어_명사" }, { category: "영어_동사" }],
      text: '<div class="mw-parser-output"><div class="mw-heading"><h2>영어</h2></div><ol><li>경의, 존경. (타인을) 존중 또는 배려.</li></ol><dl><dd><ul><li>Show him respects. 그에게 존경을 표하세요.</li></ul></dd></dl><ol><li>관계, 관련 (to)</li></ol><ul><li>관용구: <b>in all respects</b> 모든 점에 있어서</li></ul><div class="mw-heading"><h3>동사</h3></div><ol><li>존경하다, 존중하다.</li></ol></div>' };
    const rows = supplementKoreanWiktionaryPage(page, "en");
    expect(rows).toHaveLength(1);
    expect(rows[0].entry).toMatchObject({ headword: "respect", language: "en", pos: "noun",
      senses: [
        { glosses: ["경의, 존경. (타인을) 존중 또는 배려."], examples: [{ text: "Show him respects. 그에게 존경을 표하세요." }] },
        { glosses: ["관계, 관련 (to)"], examples: [{ text: "관용구: in all respects 모든 점에 있어서" }] }
      ], sourceUrl: "https://ko.wiktionary.org/w/index.php?title=respect&oldid=4365701", license: "CC BY-SA 4.0" });
    expect(rows[0].source_dump).toContain("oldid=4365701");
  });

  it("defaults to a pinned-page dry run and requires an explicit project guard for writes", async () => {
    expect(parseSupplementArguments(["--language", "en", "--page", "individual@4336969"])).toMatchObject({
      language: "en", pages: [{ word: "individual", revision: 4336969 }], write: false
    });
    expect(() => parseSupplementArguments(["--language", "en", "--page", "individual"])).toThrow();
    expect(() => parseSupplementArguments(["--language", "en", "--page", "individual@4336969", "--write"])).toThrow();
    const page = { title: "individual", revid: 4336969, categories: [{ category: "영어_형용사" }],
      text: '<div class="mw-parser-output"><h2>영어</h2><ol><li>[명사 앞에만 씀,흔히 each 뒤에 쓰여] 각각[개개]의</li></ol><h3>명사</h3><ol><li>개별자</li><li>개체</li></ol></div>' };
    const writeRows = vi.fn();
    const result = await importKoreanWiktionarySupplements({ language: "en", pages: [{ word: "individual", revision: 4336969 }] }, { loadPage: async () => page, writeRows });
    expect(result).toMatchObject({ mode: "dry-run", written: 0, rows: [{ language: "en", headword: "individual", entry: { pos: "adj" } }] });
    expect(writeRows).not.toHaveBeenCalled();
  });

  it("isolates the selected language and refuses ambiguous POS or complex source structure", () => {
    const page = { title: "shared", revid: 123, categories: [{ category: "영어_명사" }, { category: "프랑스어_형용사" }],
      text: '<div class="mw-parser-output"><h2>영어</h2><ol><li>영어 뜻</li></ol><h2>프랑스어</h2><ol><li>프랑스어 뜻</li></ol></div>' };
    expect(supplementKoreanWiktionaryPage(page, "en")[0].entry.senses).toEqual([{ glosses: ["영어 뜻"] }]);
    expect(supplementKoreanWiktionaryPage(page, "ja")).toEqual([]);
    expect(() => supplementKoreanWiktionaryPage({ ...page, categories: [...page.categories, { category: "영어_동사" }] }, "en")).toThrow("ambiguous");
    expect(() => supplementKoreanWiktionaryPage({ ...page, text: page.text.replace("영어 뜻", "영어 뜻<ul><li>예문</li></ul>") }, "en")).toThrow("Nested");
  });

  it("never writes a partial batch when a later pinned page resolves to the wrong title or revision", async () => {
    const page = { title: "shared", revid: 123, categories: [{ category: "영어_명사" }],
      text: '<div class="mw-parser-output"><h2>영어</h2><ol><li>의미</li></ol></div>' };
    const writeRows = vi.fn();
    await expect(importKoreanWiktionarySupplements({ language: "en", write: true,
      pages: [{ word: "shared", revision: 123 }, { word: "other", revision: 124 }] },
    { loadPage: async () => page, writeRows })).rejects.toThrow("does not match");
    expect(writeRows).not.toHaveBeenCalled();
  });

  it("does not write a partial repair when one pinned page has no recoverable unheaded definitions", async () => {
    const valid = { title: "shared", revid: 123, categories: [{ category: "영어_명사" }],
      text: '<div class="mw-parser-output"><h2>영어</h2><ol><li>의미</li></ol></div>' };
    const empty = { ...valid, title: "other", revid: 124,
      text: '<div class="mw-parser-output"><h2>영어</h2><h3>명사</h3><ol><li>의미</li></ol></div>' };
    const pages = [{ word: "shared", revision: 123 }, { word: "other", revision: 124 }];
    const writeRows = vi.fn();
    const loadPage = async (target: { word: string }) => target.word === "shared" ? valid : empty;
    await expect(importKoreanWiktionarySupplements({ language: "en", write: true, pages }, { loadPage, writeRows }))
      .rejects.toThrow("exactly one supplement");
    expect(writeRows).not.toHaveBeenCalled();
    expect(await importKoreanWiktionarySupplements({ language: "en", pages }, { loadPage, writeRows }))
      .toMatchObject({ mode: "dry-run", pages: 2, accepted: 1, written: 0 });
  });

  it("has stable additive IDs across source revisions and never collides with regular Kaikki IDs", () => {
    const page = { title: "shared", revid: 123, categories: [{ category: "영어_명사" }],
      text: '<div class="mw-parser-output"><h2>영어</h2><ol><li>의미</li></ol></div>' };
    const first = supplementKoreanWiktionaryPage(page, "en")[0];
    const revised = supplementKoreanWiktionaryPage({ ...page, revid: 124 }, "en")[0];
    expect(first.id).toMatch(/^kowiktionary-supplement:/);
    expect(revised.id).toBe(first.id);
    expect(revised.source_dump).not.toBe(first.source_dump);
  });
});
