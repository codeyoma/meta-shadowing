import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DictionaryResponse } from "@/lib/dictionary";
import type { Language } from "@/lib/lessons";
import { DictionaryPopup } from "./dictionary-popup";

// Explicit API fixture: these tests do not claim live Kaikki coverage.
const fixture: DictionaryResponse = { word: "wake", entries: [{ headword: "wake", language: "en", pos: "verb",
  senses: [{ glosses: ["잠에서 깨다."], examples: [{ text: "I wake up.", translation: "나는 잠에서 깬다." }] }],
  pronunciations: [{ ipa: "/weɪk/" }], sourceUrl: "https://ko.wiktionary.org/wiki/wake", license: "CC BY-SA 4.0"
}] };
let container: HTMLDivElement;
let trigger: HTMLButtonElement;
let root: Root;
let mounted: boolean;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  trigger = document.createElement("button");
  document.body.append(trigger, container);
  root = createRoot(container);
  mounted = true;
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove();
  trigger.remove();
  vi.unstubAllGlobals();
});

async function render(word = "wake", language: Language = "english") {
  await act(async () => root.render(createElement(DictionaryPopup, { selection: { word, trigger }, language, onClose: vi.fn() })));
}

it("shows loading, then only the source response's meanings, examples, and attribution", async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn((_url: RequestInfo | URL, _options?: RequestInit) => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", fetchMock);
  await render();
  expect(document.querySelector('[role="status"]')?.textContent).toBe("뜻을 찾고 있어요…");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/dictionary?language=english&word=wake");
  await act(async () => resolve(new Response(JSON.stringify(fixture))));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("잠에서 깨다.");
  expect(dialog.textContent).toContain("I wake up.");
  expect(dialog.textContent).toContain("나는 잠에서 깬다.");
  expect(dialog.textContent).toContain("/weɪk/");
  expect(dialog.querySelector('a[href="https://ko.wiktionary.org/wiki/wake"]')).not.toBeNull();
  const attribution = dialog.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!;
  expect(attribution).not.toBeNull();
  await act(async () => attribution.click());
  expect(dialog.querySelector('a[href="https://kaikki.org/kowiktionary/"]')).not.toBeNull();
  expect(dialog.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/"]')).not.toBeNull();
});

it("shows an honest empty state when the dictionary has no entry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ word: "wake", entries: [] }))));
  await render();
  expect(document.querySelector('[role="status"]')?.textContent).toContain("등록된 한국어 뜻이 없어요.");
  expect(document.querySelector("article")).toBeNull();
});

it("distinguishes the clicked inflection from a suggested base word", async () => {
  const result: DictionaryResponse = { word: "passed", entries: [{ headword: "pass", language: "en", pos: "verb",
    senses: [{ glosses: ["지나가다, 통과하다."] }], sourceUrl: "https://ko.wiktionary.org/wiki/pass", license: "CC BY-SA 4.0", matchType: "lemma"
  }] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(result))));
  await render("passed");
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("passed 뜻");
  expect(document.querySelector("article")?.textContent).toContain("passed → pass · 원형 후보");
  expect(document.querySelector("article")?.textContent).toContain("지나가다, 통과하다.");
  const source = document.querySelector<HTMLAnchorElement>('article h3 a')!;
  expect(source?.href).toBe("https://ko.wiktionary.org/wiki/pass");
  expect(source.getAttribute("aria-label")).toBe("pass 원문 보기 (새 탭)");
  expect(source.target).toBe("_blank");
  expect(source.rel).toBe("noopener noreferrer");
});

it("shows all returned parts of speech as badges with a single source footer", async () => {
  const noun = { ...fixture.entries[0], pos: "noun", senses: [{ glosses: ["배가 지나간 자국."] }] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...fixture, entries: [...fixture.entries, noun] }))));
  await render();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect([...dialog.querySelectorAll('article [data-slot="badge"]')].map(node => node.textContent)).toEqual(["verb", "noun"]);
  expect(dialog.textContent).toContain("잠에서 깨다.");
  expect(dialog.textContent).toContain("배가 지나간 자국.");
  expect(dialog.querySelectorAll('article h3 a[href="https://ko.wiktionary.org/wiki/wake"]')).toHaveLength(2);
  expect(dialog.querySelectorAll('footer a[href="https://ko.wiktionary.org/wiki/wake"]')).toHaveLength(1);
  expect(dialog.querySelector('footer a[href="https://ko.wiktionary.org/wiki/wake"]')?.textContent).toBe("위키낱말사전 원문");
});

it("offers a working retry for a failed lookup", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
  vi.stubGlobal("fetch", fetchMock);
  await render();
  const alert = document.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain("뜻을 불러오지 못했어요.");
  await act(async () => alert.querySelector<HTMLButtonElement>("button")!.click());
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector("article")?.textContent).toContain("잠에서 깨다.");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("labels only explicit entry and sense transitivity without moving sense labels to the whole word", async () => {
  const entries = [
    { ...fixture.entries[0], tags: ["intransitive"], senses: [{ glosses: ["지나가다."], tags: ["intransitive"] }] },
    { ...fixture.entries[0], senses: [{ glosses: ["건네주다."], tags: ["transitive"] }, { glosses: ["지나다."] }] },
    { ...fixture.entries[0], pos: "noun" },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ word: "pass", entries }))));
  await render("pass");
  const articles = [...document.querySelectorAll("article")];
  expect([...articles[0].querySelectorAll('[data-slot="badge"]')].map(node => node.textContent)).toEqual(["verb", "자동사"]);
  expect([...articles[1].querySelectorAll('h3 [data-slot="badge"]')].map(node => node.textContent)).toEqual(["verb"]);
  expect(articles[1].querySelector("li:first-child")?.textContent).toContain("타동사");
  expect(articles[1].querySelector("li:nth-child(2)")?.textContent).not.toContain("타동사");
  expect([...articles[2].querySelectorAll('[data-slot="badge"]')].map(node => node.textContent)).toEqual(["noun"]);
});

it("keeps distinct lemma source links available in the shared attribution disclosure", async () => {
  const entries = [fixture.entries[0], { ...fixture.entries[0], headword: "waken", matchType: "lemma",
    sourceUrl: "https://ko.wiktionary.org/wiki/waken" }];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ word: "wake", entries }))));
  await render();
  const disclosure = document.querySelector<HTMLButtonElement>('[aria-label="출처 및 라이선스"]')!;
  expect(document.querySelector('footer a[href="https://ko.wiktionary.org/wiki/waken"]')).toBeNull();
  await act(async () => disclosure.click());
  expect(document.querySelector('footer a[href="https://ko.wiktionary.org/wiki/waken"]')?.textContent).toBe("waken 원문");
  expect(document.querySelector('article a[href="https://ko.wiktionary.org/wiki/waken"]')).not.toBeNull();
});

it("links each headword to its own supplied source, including revision-specific lemma pages", async () => {
  const entries = [
    { ...fixture.entries[0], headword: "guaranteed", pos: "unknown", sourceUrl: "https://ko.wiktionary.org/wiki/guaranteed" },
    { ...fixture.entries[0], headword: "guarantee", matchType: "lemma", sourceUrl: "https://ko.wiktionary.org/w/index.php?title=guarantee&oldid=12345" },
    { ...fixture.entries[0], headword: "guarantee", pos: "noun", matchType: "lemma", sourceUrl: "https://ko.wiktionary.org/wiki/guarantee" },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ word: "guaranteed", entries }))));
  await render("guaranteed");
  const links = [...document.querySelectorAll<HTMLAnchorElement>("article h3 a")];
  expect(links.map(link => link.href)).toEqual([
    "https://ko.wiktionary.org/wiki/guaranteed",
    "https://ko.wiktionary.org/w/index.php?title=guarantee&oldid=12345",
    "https://ko.wiktionary.org/wiki/guarantee",
  ]);
  for (const link of links) {
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  }
});

it.each([
  ["japanese", "ja"], ["chinese", "zh"], ["german", "de"], ["french", "fr"]
] as const)("marks %s dictionary text with its locale", async (language, locale) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ word: "target", entries: [] })));
  vi.stubGlobal("fetch", fetchMock);
  await render("target", language);
  expect(document.querySelector(`[role="dialog"] h2 [lang="${locale}"]`)?.textContent).toBe("target");
  expect(fetchMock.mock.calls[0][0]).toBe(`/api/dictionary?language=${language}&word=target`);
});

it("aborts the pending request on close, including a late response", async () => {
  let resolve!: (response: Response) => void;
  let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn((_url, options) => {
    signal = options.signal;
    return new Promise<Response>(done => { resolve = done; });
  }));
  await render();
  await act(async () => root.unmount());
  mounted = false;
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(new Response(JSON.stringify(fixture))));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
