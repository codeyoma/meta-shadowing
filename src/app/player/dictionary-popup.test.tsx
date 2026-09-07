import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DictionaryResponse } from "@/lib/dictionary";
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

async function render(word = "wake") {
  await act(async () => root.render(createElement(DictionaryPopup, { selection: { word, trigger }, language: "english", onClose: vi.fn() })));
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
  expect(document.querySelector('article a')?.getAttribute("href")).toBe("https://ko.wiktionary.org/wiki/pass");
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
