import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lessons } from "@/lib/lessons";
import type { CompletionRecord } from "@/lib/learning-records";
import { DEFAULT_SESSION_SETTINGS } from "@/lib/session-settings";
import { LanguagePage, LessonPage } from "./browse-pages";

vi.mock("./browse-shell", () => ({
  useBrowse: () => ({ catalog: lessons, selection: { language: "english", lessonId: lessons[0].id } }),
  useBrowseScroll: () => ({ current: null }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function completion(lessonIndex: number, stage: number, version = "fixture-v1"): CompletionRecord {
  const lesson = lessons[lessonIndex];
  return { runId: `${lesson.id}-${version}-${stage}`, lessonId: lesson.id, lessonVersion: version,
    lessonName: lesson.name, language: lesson.language, level: Math.ceil(stage / 2), stage,
    nextUnit: 24, nextPhrase: 24, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
    completedAt: "2026-09-08T00:00:00Z" };
}
async function render() { await act(async () => root.render(createElement(LessonPage))); }
function progress(name: string) { return container.querySelector(`[role="progressbar"][aria-label="${name}"]`); }

it("counts fully completed current-version lessons, not stages, duplicate runs, or another language", async () => {
  const history = [
    ...Array.from({ length: 16 }, (_, i) => completion(0, i + 1)),
    ...Array.from({ length: 15 }, (_, i) => completion(1, i + 1)),
    { ...completion(1, 1), runId: "replayed-stage" },
    completion(1, 16, "old-version"),
    ...Array.from({ length: 16 }, (_, i) => completion(2, i + 1)),
  ];
  localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ history, progress: null, studyDays: [] }));
  await render();
  expect(container.textContent).toContain("완료한 레슨");
  expect(progress("레슨 학습 진척도")?.getAttribute("aria-valuenow")).toBe("1");
  expect(progress("레슨 학습 진척도")?.getAttribute("aria-valuemax")).toBe("2");
  expect(progress("Morning Routine 스테이지 진척도")?.getAttribute("aria-valuenow")).toBe("16");
  expect(progress("Daily Conversation 스테이지 진척도")?.getAttribute("aria-valuenow")).toBe("15");
  expect(progress("Daily Conversation 스테이지 진척도")?.getAttribute("aria-valuemax")).toBe("16");
  expect(progress("Daily Conversation 스테이지 진척도")?.nextElementSibling?.textContent).toBe("15 / 16");
});

it("does not mistake a resumed stage 14 for completed stages", async () => {
  const { completedAt: _, ...saved } = completion(0, 14);
  localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ history: [], progress: { ...saved, nextUnit: 0, nextPhrase: 0 }, studyDays: [] }));
  await render();
  expect(container.textContent).toContain("스테이지 14 이어서 학습");
  expect(progress("레슨 학습 진척도")?.getAttribute("aria-valuenow")).toBe("0");
  expect(progress("Morning Routine 스테이지 진척도")?.getAttribute("aria-valuenow")).toBe("0");
  expect(progress("Morning Routine 스테이지 진척도")?.getAttribute("aria-valuemax")).toBe("16");
});

it("offers all supported languages with representative country flags", async () => {
  await act(async () => root.render(createElement(LanguagePage)));
  const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/lessons?language="]')];
  expect(links.map(link => [link.getAttribute("href"), link.textContent])).toEqual([
    ["/lessons?language=english", "🇬🇧영어English"],
    ["/lessons?language=japanese", "🇯🇵일본어日本語"],
    ["/lessons?language=chinese", "🇨🇳중국어中文"],
    ["/lessons?language=german", "🇩🇪독일어Deutsch"],
    ["/lessons?language=french", "🇫🇷프랑스어Français"],
  ]);
});
