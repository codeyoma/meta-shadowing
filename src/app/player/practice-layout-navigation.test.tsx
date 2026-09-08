import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CycleProgress, PracticeHeader, PracticeProgress } from "./practice-layout";

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

it("exposes the menu and phrase progress as one player navigation landmark", () => {
  act(() => root.render(createElement(PracticeHeader, {
    menuOpen: false,
    onMenu: vi.fn(),
    children: createElement(PracticeProgress, { index: 1, count: 3, progress: 1, progressLabel: "프레이즈 진행" })
  })));

  const navigation = container.querySelector('nav[aria-label="학습 탐색"]');
  expect(navigation).not.toBeNull();
  expect(navigation!.querySelector('button[aria-label="학습 메뉴"]')).not.toBeNull();
  expect(navigation!.querySelector('[role="progressbar"][aria-label="프레이즈 진행"]')).not.toBeNull();
});

it("marks only the confirmed-count boundary as the current listening cycle", () => {
  act(() => root.render(createElement(CycleProgress, { completed: 1, target: 3, audioRef: { current: null } })));

  const steps = Array.from(container.querySelectorAll<HTMLElement>("[data-visible]"));
  expect(steps.map(step => ({
    visible: step.dataset.visible,
    complete: step.dataset.complete,
    current: step.dataset.current
  }))).toEqual([
    { visible: "true", complete: "true", current: undefined },
    { visible: "true", complete: "false", current: "true" },
    { visible: "true", complete: "false", current: undefined },
    { visible: "false", complete: undefined, current: undefined },
    { visible: "false", complete: undefined, current: undefined }
  ]);
});

it("has no current playback ring after the confirmed count reaches its target", () => {
  act(() => root.render(createElement(CycleProgress, { completed: 3, target: 3, audioRef: { current: null } })));

  expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(0);
  expect(container.querySelector('[aria-label="완료한 듣기"]')?.textContent).toBe("필수 3 / 3");
});
