import { afterEach, expect, it, vi } from "vitest";
import { playStageSound } from "./stage-sound";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function audioDevice(state = "running") {
  vi.useFakeTimers();
  let resolveResume = () => {};
  let rejectResume = (_reason: Error) => {};
  const voices: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  const device = {
    state, currentTime: 10, destination: {},
    resume: vi.fn(() => new Promise<void>((resolve, reject) => {
      resolveResume = () => { device.state = "running"; resolve(); };
      rejectResume = reject;
    })),
    close: vi.fn(async () => { device.state = "closed"; }),
    createOscillator: vi.fn(() => {
      const voice = {
        type: "sine", frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null,
        connect: (gain: unknown) => gain
      };
      voices.push(voice);
      return voice;
    }),
    createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: {
      setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn()
    } }))
  };
  vi.stubGlobal("AudioContext", class { constructor() { return device; } });
  return { device, voices, resolveResume: () => resolveResume(), rejectResume: () => rejectResume(new Error("Blocked")) };
}

it.each(["select", "start"] as const)("applies the louder peak gain to every note of the %s cue", cue => {
  const { device } = audioDevice();
  playStageSound(cue);
  const gains = device.createGain.mock.results.map(result => result.value);
  expect(gains).toHaveLength(cue === "select" ? 1 : 2);
  for (const gain of gains) {
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.16, expect.any(Number));
  }
});

it("keeps the start cue alive until its last note ends, then releases its device", () => {
  const { device, voices } = audioDevice();
  playStageSound("start");
  expect(voices).toHaveLength(2);
  expect(voices.every(voice => voice.start.mock.calls.length === 1)).toBe(true);
  expect(device.close).not.toHaveBeenCalled();
  voices[0].onended!();
  expect(device.close).not.toHaveBeenCalled();
  voices[1].onended!();
  expect(device.close).toHaveBeenCalledTimes(1);
  expect(voices.every(voice => voice.disconnect.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("plays only once after the audio device becomes available", async () => {
  const { device, voices, resolveResume } = audioDevice("suspended");
  playStageSound("select");
  expect(voices).toHaveLength(0);
  resolveResume();
  await Promise.resolve();
  expect(voices).toHaveLength(1);
  expect(voices[0].start).toHaveBeenCalledTimes(1);
  voices[0].onended!();
  expect(device.close).toHaveBeenCalledTimes(1);
});

it("expires a blocked cue so a late resume cannot make an unrelated sound", async () => {
  const { device, voices, resolveResume } = audioDevice("suspended");
  playStageSound("start");
  vi.advanceTimersByTime(1000);
  expect(device.close).toHaveBeenCalledTimes(1);
  resolveResume();
  await Promise.resolve();
  expect(voices).toHaveLength(0);
});

it("lets a cue finish when resume resolves just before the waiting deadline", async () => {
  const { device, voices, resolveResume } = audioDevice("suspended");
  playStageSound("start");
  vi.advanceTimersByTime(950);
  resolveResume();
  await Promise.resolve();
  expect(voices).toHaveLength(2);
  vi.advanceTimersByTime(260);
  expect(device.close).not.toHaveBeenCalled();
  voices[0].onended!();
  voices[1].onended!();
  expect(device.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("releases a device even if playback never delivers its ended events", () => {
  const { device, voices } = audioDevice();
  playStageSound("start");
  vi.advanceTimersByTime(2000);
  expect(device.close).toHaveBeenCalledTimes(1);
  expect(voices.every(voice => voice.stop.mock.calls.length === 2)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("closes a rejected audio device without an unhandled rejection", async () => {
  const { device, voices, rejectResume } = audioDevice("suspended");
  expect(() => playStageSound("select")).not.toThrow();
  rejectResume();
  await Promise.resolve();
  expect(voices).toHaveLength(0);
  expect(device.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up partial synthesis if the audio device throws", () => {
  const { device, voices } = audioDevice();
  device.createGain.mockImplementation(() => { throw new Error("Device disconnected"); });
  expect(() => playStageSound("start")).not.toThrow();
  expect(device.close).toHaveBeenCalledTimes(1);
  expect(voices.every(voice => voice.disconnect.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up even when resume throws synchronously", () => {
  const { device } = audioDevice("suspended");
  device.resume.mockImplementation(() => { throw new Error("Audio disconnected"); });
  expect(() => playStageSound("start")).not.toThrow();
  expect(device.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("stays optional when Web Audio is unsupported", () => {
  vi.stubGlobal("AudioContext", undefined);
  expect(() => playStageSound("select")).not.toThrow();
  expect(() => playStageSound("start")).not.toThrow();
});
