import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioPlaybackButton } from "./audio-playback-button";

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
  media = { paused: true, ended: false, duration: 2, currentTime: 0, error: null };
  for (const key of Object.keys(media) as (keyof typeof media)[]) {
    Object.defineProperty(audio, key, { configurable: true, get: () => media[key] });
  }
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(playing: boolean) {
  act(() => root.render(createElement(AudioPlaybackButton, {
    audioRef: { current: audio }, playing, disabled: false, onClick: () => {}
  })));
}

function emit(event: string, updates: Partial<typeof media> = {}) {
  Object.assign(media, updates);
  act(() => audio.dispatchEvent(new Event(event)));
}

function outline() { return container.querySelector('[role="progressbar"]'); }

it("keeps the playback outline absent while idle, loading, paused, waiting, and ended", () => {
  render(false);
  expect(outline()).toBeNull();
  render(true);
  emit("play", { paused: false });
  expect(outline()).toBeNull();
  emit("playing");
  emit("timeupdate", { currentTime: 0.5 });
  expect(outline()?.getAttribute("aria-valuenow")).toBe("25");
  emit("waiting");
  expect(outline()).toBeNull();
  emit("playing");
  expect(outline()).not.toBeNull();
  emit("pause", { paused: true });
  expect(outline()).toBeNull();
  emit("playing", { paused: false });
  emit("ended", { paused: true, ended: true, currentTime: 2 });
  expect(outline()).toBeNull();
});

it("does not show a stale outline between grouped recordings or after a media error", () => {
  render(true);
  emit("playing", { paused: false, currentTime: 1 });
  expect(outline()?.getAttribute("aria-valuenow")).toBe("50");
  emit("ended", { paused: true, ended: true, currentTime: 2 });
  expect(outline()).toBeNull();
  emit("emptied", { ended: false, currentTime: 0 });
  emit("play", { paused: false });
  expect(outline()).toBeNull();
  emit("playing");
  expect(outline()?.getAttribute("aria-valuenow")).toBe("0");
  emit("error", { error: { code: 3, message: "Decode error" } as MediaError });
  expect(outline()).toBeNull();
});

it("keeps unknown-duration playback indeterminate while it is actually playing", () => {
  render(true);
  emit("playing", { paused: false, duration: Infinity });
  expect(outline()).not.toBeNull();
  expect(outline()?.hasAttribute("aria-valuenow")).toBe(false);
  expect(outline()?.getAttribute("aria-valuetext")).toBe("재생 길이 확인 중");
});
