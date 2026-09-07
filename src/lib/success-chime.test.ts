import { afterEach, expect, it, vi } from "vitest";
import { createSuccessChime } from "./success-chime";

afterEach(() => vi.unstubAllGlobals());

function audioDevice() {
  let resume: () => void = () => {};
  const starts = vi.fn();
  const device = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => new Promise<void>(resolve => { resume = () => { device.state = "running"; resolve(); }; })),
    close: vi.fn(async () => { device.state = "closed"; }),
    createOscillator: () => ({
      type: "sine", frequency: { value: 0 }, start: starts, stop: vi.fn(), disconnect: vi.fn(),
      connect: (gain: { connect: () => void }) => gain
    }),
    createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: {
      setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn()
    } })
  };
  vi.stubGlobal("AudioContext", class { constructor() { return device; } });
  return { device, starts, resume: () => resume() };
}

it("plays a requested cue once after an asynchronous audio-device resume", async () => {
  const audio = audioDevice();
  const chime = createSuccessChime();
  chime.unlock();
  chime.play();
  expect(audio.starts).not.toHaveBeenCalled();
  audio.resume();
  await Promise.resolve();
  expect(audio.starts).toHaveBeenCalledTimes(3);
  chime.unlock();
  expect(audio.starts).toHaveBeenCalledTimes(3);
  chime.dispose();
});

it("does not play a queued cue after disposal", async () => {
  const audio = audioDevice();
  const chime = createSuccessChime();
  chime.unlock();
  chime.play();
  chime.dispose();
  audio.resume();
  await Promise.resolve();
  expect(audio.starts).not.toHaveBeenCalled();
});

it("does not interrupt practice if Web Audio is unavailable", () => {
  vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Audio unavailable"); } });
  const chime = createSuccessChime();
  expect(() => { chime.unlock(); chime.play(); chime.dispose(); }).not.toThrow();
});

it("cancels a queued cue when leaving its phrase", async () => {
  const audio = audioDevice();
  const chime = createSuccessChime();
  chime.unlock();
  chime.play();
  chime.cancelPending();
  audio.resume();
  await Promise.resolve();
  expect(audio.starts).not.toHaveBeenCalled();
  chime.dispose();
});
