import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Language } from "@/lib/lessons";
import { DictionaryWords } from "./dictionary-words";
import { PracticeSubtitles } from "./practice-subtitles";

const mounted: { root: Root; container: HTMLDivElement }[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) { act(() => root.unmount()); container.remove(); }
  vi.unstubAllGlobals();
});

function render(component: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(component));
  return container;
}
function renderWords(text: string, language: Language) {
  return render(createElement(DictionaryWords, { text, language, onWordSelect: vi.fn() }));
}

it("keeps server output as plain text so different ICU versions cannot break hydration", () => {
  const html = renderToStaticMarkup(createElement(DictionaryWords, { text: "起きます。", language: "japanese", onWordSelect: vi.fn() }));
  expect(html).toBe("起きます。");
});

it("preserves all visible punctuation, apostrophes, spaces, and line breaks", () => {
  const text = '  “Don’t stop,” she said.\nGo!  123 ';
  const container = renderWords(text, "english");
  expect(container.textContent).toBe(text);
  expect([...container.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Don’t", "stop", "she", "said", "Go"]);
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Don’t 뜻 보기");
  expect(container.querySelector("button")?.getAttribute("aria-haspopup")).toBe("dialog");
});

it("segments unspaced Japanese without making punctuation clickable", () => {
  const text = "私は学校へ行きます。\n「猫！」";
  const container = renderWords(text, "japanese");
  expect(container.textContent).toBe(text);
  const words = [...container.querySelectorAll("button")].map(button => button.textContent);
  expect(words).toContain("学校");
  expect(words).toContain("猫");
  expect(words.every(word => !/[。！「」\s]/u.test(word ?? ""))).toBe(true);
});

it("selects hyphenated English compounds as one word while keeping sentence dashes separate", () => {
  const text = "My ex-girlfriend passed. A state-of-the-art COVID-19 test — well done. non‑smoker; word--word";
  const selected = vi.fn();
  const container = render(createElement(DictionaryWords, { text, language: "english", onWordSelect: selected }));
  expect(container.textContent).toBe(text);
  const words = [...container.querySelectorAll("button")].map(button => button.textContent);
  expect(words).toEqual(["My", "ex-girlfriend", "passed", "A", "state-of-the-art", "COVID-19", "test", "well", "done", "non‑smoker", "word", "word"]);
  const compound = container.querySelector<HTMLButtonElement>('[aria-label="ex-girlfriend 뜻 보기"]')!;
  act(() => compound.click());
  expect(selected).toHaveBeenCalledWith("ex-girlfriend", compound);
});

it("never reconstructs hidden target text or makes Korean translations interactive", () => {
  const container = render(createElement(PracticeSubtitles, {
    lines: [{ target: '"First.', korean: '"첫째.' }], language: "english", grouped: false,
    currentIndex: 0, highlight: false, canvasRef: { current: null }, currentLineRef: { current: null }, onWordSelect: vi.fn()
  }));
  expect(container.querySelector('[lang="en"]')?.textContent).toBe('"First.');
  expect(container.querySelector('[lang="ko"]')?.textContent).toBe('"첫째.');
  expect([...container.querySelectorAll("button")].map(button => button.textContent)).toEqual(["First"]);
  expect(container.querySelector('[lang="ko"] button')).toBeNull();
});

it("keeps dialogue turn boundaries and grouped current-phrase state with dictionary words", () => {
  const container = render(createElement(PracticeSubtitles, {
    lines: [{ target: '"Hello."\n"Goodbye."', korean: '"안녕."\n"잘 가."' }, { target: "Next.", korean: "다음." }],
    language: "english", grouped: true, currentIndex: 1, highlight: true,
    canvasRef: { current: null }, currentLineRef: { current: null }, onWordSelect: vi.fn()
  }));
  expect([...container.querySelectorAll('[aria-label="대화"] > li')].map(turn => turn.getAttribute("data-side"))).toEqual(["left", "right"]);
  expect(container.querySelector('[aria-current="true"] [lang="en"]')?.textContent).toBe("Next.");
  expect([...container.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Hello", "Goodbye", "Next"]);
});
