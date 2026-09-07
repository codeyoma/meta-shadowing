import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseLessonDraft } from "@/lib/lesson-draft-parser";
import type { LessonPhrase, PublishedLesson } from "@/lib/lessons";
import { SentenceList } from "./sentence-menu";

const parsed = parseLessonDraft(
  "Before.\n## First\nOne.\n\nTwo.\n## Second\nThree.\n## First\nFour.",
  "이전.\n## 첫 섹션\n하나.\n\n둘.\n## 둘째 섹션\n셋.\n## 중복 이름\n넷."
);
const phrases = parsed.entries.filter((entry): entry is LessonPhrase => entry.kind === "phrase");
const lesson = {
  id: "sections", version: "v1", language: "english", name: "Sections", localizedName: "섹션",
  phraseCount: 5, sectionCount: 3, entries: parsed.entries, phrases
} satisfies PublishedLesson;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(currentPhraseNumbers: number[], source = lesson, onSelect = vi.fn()) {
  await act(async () => root.render(createElement(SentenceList, { lesson: source, currentPhraseNumbers, onSelect })));
  return onSelect;
}
const triggers = () => [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
const visiblePhrases = () => [...container.querySelectorAll<HTMLButtonElement>("button[aria-label*='번 문장']")]
  .filter(button => !button.closest("[hidden]"));

it("opens only the current section, keeping untitled introductory sentences reachable", async () => {
  await render([4]);
  expect(triggers().map(button => button.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
  expect(visiblePhrases().map(button => button.getAttribute("aria-label")?.split(" · ")[0])).toEqual(["1번 문장", "4번 문장"]);
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^4번 문장/);
  expect(document.activeElement?.getAttribute("aria-current")).toBe("true");
});

it("keeps blank separators inside their section and duplicate section names independent", async () => {
  const selected = await render([4]);
  expect(triggers()).toHaveLength(3);
  await act(async () => triggers()[0].click());
  expect(triggers().map(button => button.getAttribute("aria-expanded"))).toEqual(["true", "true", "false"]);
  expect(container.querySelectorAll('[aria-label="구간 경계"]')).toHaveLength(1);
  const thirdPhrase = visiblePhrases().find(button => button.getAttribute("aria-label")?.startsWith("3번 문장"))!;
  await act(async () => thirdPhrase.click());
  expect(selected).toHaveBeenCalledWith(2);
  await act(async () => triggers()[0].click());
  expect(visiblePhrases()).toHaveLength(2);
});

it("opens every section containing a current phrase in grouped practice", async () => {
  await render([3, 4]);
  expect(triggers().map(button => button.getAttribute("aria-expanded"))).toEqual(["true", "true", "false"]);
  expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(2);
});

it("does not invent a section for material without headings", async () => {
  const source = { ...lesson, sectionCount: 0, entries: phrases, phrases };
  const selected = await render([5], source);
  expect(triggers()).toHaveLength(0);
  expect(visiblePhrases()).toHaveLength(5);
  await act(async () => visiblePhrases()[4].click());
  expect(selected).toHaveBeenCalledWith(4);
});
