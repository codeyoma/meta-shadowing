import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CycleProgress } from "./practice-layout";

let container: HTMLDivElement;
let root: Root;
let audio: HTMLAudioElement;
let media: { paused: boolean; ended: boolean; duration: number; currentTime: number; error: MediaError | null };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  audio = document.createElement("audio");
  media = { paused: true, ended: false, duration: 4, currentTime: 0, error: null };
  for (const key of Object.keys(media) as (keyof typeof media)[]) {
    Object.defineProperty(audio, key, { configurable: true, get: () => media[key] });
  }
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(completed = 0, target: 3 | 5 = 3) {
  act(() => root.render(createElement(CycleProgress, { completed, target, audioRef: { current: audio } })));
}
function emit(event: string, updates: Partial<typeof media> = {}) {
  Object.assign(media, updates);
  act(() => audio.dispatchEvent(new Event(event)));
}
function ring() { return container.querySelector('[role="progressbar"]'); }

it("fills only the current cycle from media time and keeps its progress while paused or buffering", () => {
  render();
  emit("playing", { paused: false, currentTime: 1 });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("25");
  expect(ring()?.closest('[data-current="true"]')).not.toBeNull();
  expect(ring()?.querySelector("circle")?.getAttribute("stroke-dashoffset")).toBe("75");
  emit("timeupdate", { currentTime: 2 });
  emit("pause", { paused: true });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("50");
  emit("waiting");
  expect(ring()?.getAttribute("aria-valuenow")).toBe("50");
  expect(container.textContent).toBe("필수 0 / 3");
});

it("finishes the ring without confirming the listen and resets on a new recording or seek", () => {
  render();
  emit("ended", { ended: true, currentTime: 4 });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("100");
  expect(container.textContent).toBe("필수 0 / 3");
  emit("emptied", { ended: false, currentTime: 0 });
  render(1);
  expect(ring()?.getAttribute("aria-valuenow")).toBe("0");
  emit("timeupdate", { currentTime: 3 });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("75");
  emit("seeking", { currentTime: 0 });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("0");
  render(3);
  expect(ring()).toBeNull();
  render(3, 5);
  expect(ring()?.closest('[data-current="true"]')?.previousElementSibling?.getAttribute("data-complete")).toBe("true");
});

it.each([Infinity, NaN, 0])("does not invent progress for unknown duration %s", duration => {
  render();
  emit("playing", { paused: false, duration, currentTime: 2 });
  expect(ring()).not.toBeNull();
  expect(ring()?.hasAttribute("aria-valuenow")).toBe(false);
  expect(ring()?.getAttribute("aria-valuetext")).toBe("재생 길이 확인 중");
  expect(ring()?.querySelector("circle")?.getAttribute("stroke-dashoffset")).toBe("100");
  emit("durationchange", { duration: 4 });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("50");
  emit("error", { error: { code: 3 } as MediaError });
  expect(ring()?.getAttribute("aria-valuenow")).toBe("0");
});
