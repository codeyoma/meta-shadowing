import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PublishedLesson } from "@/lib/lessons";
import { PlayerDrawer } from "./player-drawer";

const phrase: PublishedLesson["phrases"][number] = {
  kind: "phrase", sourceLine: 1, phraseNumber: 1, target: "Hello.", korean: "안녕하세요."
};
const lesson: PublishedLesson = {
  id: "drawer-close-test", version: "v1", language: "english", name: "Drawer close test",
  localizedName: "서랍 닫기 테스트", phraseCount: 1, sectionCount: 0, entries: [phrase], phrases: [phrase]
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("keeps menu actions and its accessible title without close buttons", async () => {
  await act(async () => root.render(createElement(PlayerDrawer, {
    lesson,
    open: true,
    initialView: "menu",
    settings: createElement("p", null, "Settings"),
    currentPhraseNumbers: [1],
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onStages: vi.fn(),
    onViewChange: vi.fn()
  })));

  const buttons = [...document.querySelectorAll("button")];
  expect(buttons.some(button => /닫기/.test(button.getAttribute("aria-label") ?? button.textContent ?? ""))).toBe(false);
  expect(document.getElementById("player-menu-title")?.textContent).toBe("학습 메뉴");
  expect(buttons.some(button => button.textContent === "학습 설정")).toBe(true);
});

it("shows the sentence list without extra helper copy in the drawer description", async () => {
  await act(async () => root.render(createElement(PlayerDrawer, {
    lesson,
    open: true,
    initialView: "menu",
    settings: createElement("p", null, "Settings"),
    currentPhraseNumbers: [1],
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onStages: vi.fn(),
    onViewChange: vi.fn()
  })));

  const sentenceButton = [...document.querySelectorAll("button")].find(button => button.textContent === "문장 목록");
  await act(async () => sentenceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  expect(document.getElementById("player-menu")?.getAttribute("aria-describedby")).toBe("player-menu-description");
  expect(document.getElementById("sentence-menu-help")).toBeNull();
  expect(document.body.textContent).not.toContain("재생은 일시정지됩니다.");
});
