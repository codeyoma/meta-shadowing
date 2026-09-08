import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PracticeSubtitles, type PracticeSubtitlesProps } from "./practice-subtitles";

const dialogue = {
  target: '"First."\n"Second."\n"Third."',
  korean: '"첫째."\n"둘째."\n"셋째."'
};

function render(overrides: Partial<PracticeSubtitlesProps> = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(createElement(PracticeSubtitles, {
    lines: [dialogue], language: "english", grouped: false, currentIndex: 0, highlight: false,
    canvasRef: { current: null }, currentLineRef: { current: null }, ...overrides
  }));
  return root;
}

it("renders bilingual turns left, right, left without playback controls in the subtitles", () => {
  const root = render();
  const turns = [...root.querySelectorAll('[aria-label="대화"] > li')];
  expect(turns.map(turn => turn.getAttribute("data-side"))).toEqual(["left", "right", "left"]);
  expect(turns.map(turn => [...(turn.querySelector(':scope > [data-slot="bubble-content"]')?.children ?? [])].map(child => [child.getAttribute("lang"), child.textContent]))).toEqual([
    [["en", '"First."'], ["ko", '"첫째."']],
    [["en", '"Second."'], ["ko", '"둘째."']],
    [["en", '"Third."'], ["ko", '"셋째."']]
  ]);
  expect(root.querySelectorAll("button")).toHaveLength(0);
});

it("keeps ordinary sentences, unmatched dialogue, and first-token hints unsplit", () => {
  for (const text of [
    { target: "An ordinary sentence.", korean: "일반 문장." },
    { ...dialogue, korean: '"하나의 번역."' },
    { target: '"First.', korean: '"첫째.' }
  ]) {
    const root = render({ lines: [text] });
    expect(root.querySelector('[aria-label="대화"]')).toBeNull();
    expect(root.querySelectorAll('[data-slot="bubble"][data-variant="outline"] > [data-slot="bubble-content"]')).toHaveLength(1);
    expect(root.querySelector('[lang="en"]')?.textContent).toBe(text.target);
    expect(root.querySelector('[lang="ko"]')?.textContent).toBe(text.korean);
  }
});

it("preserves grouped phrase boundaries and current phrase while restarting alternation per dialogue", () => {
  const root = render({ lines: [dialogue, { target: "Plain.", korean: "일반." }, dialogue], grouped: true, currentIndex: 2, highlight: true });
  const phrases = root.querySelectorAll('[aria-label="묶음 프레이즈"] > li');
  expect(phrases).toHaveLength(3);
  expect([...phrases].map(line => line.getAttribute("aria-current"))).toEqual([null, null, "true"]);
  expect([...root.querySelectorAll('[aria-label="대화"]')].map(list => list.firstElementChild?.getAttribute("data-side"))).toEqual(["left", "left"]);
  expect(phrases[1].querySelector('[lang="en"]')?.textContent).toBe("Plain.");
  expect(phrases[1].querySelector('[data-slot="bubble"] > [data-slot="bubble-content"] > [lang="ko"]')?.textContent).toBe("일반.");
  expect([...phrases].map(phrase => [...phrase.querySelectorAll('[lang="en"]')].map(copy => copy.textContent))).toEqual([
    ['"First."', '"Second."', '"Third."'], ["Plain."], ['"First."', '"Second."', '"Third."']
  ]);
});

it.each([
  ["japanese", "ja"], ["chinese", "zh"], ["german", "de"], ["french", "fr"]
] as const)("marks %s subtitle text with its locale", (language, locale) => {
  const root = render({ language, lines: [{ target: "Target.", korean: "번역." }] });
  expect(root.querySelector(`[lang="${locale}"]`)?.textContent).toBe("Target.");
});
