import { expect, it } from "vitest";
import { createAudioSession, isAudioRepeatAvailable, type AudioSession } from "./audio-session";

const ready = { ...createAudioSession({ phraseCount: 2 }), completedCycles: 3, confirmedCycles: 3 };
it("allows REPEAT only after the three required confirmations at a ready boundary", () => {
  expect(isAudioRepeatAvailable(ready)).toBe(true);
  expect(isAudioRepeatAvailable({ ...ready, phase: "paused", pausedPhase: "ready" })).toBe(true);
  expect(isAudioRepeatAvailable({ ...ready, confirmedCycles: 2 })).toBe(false);
  expect(isAudioRepeatAvailable({ ...ready, confirmedCycles: 4 })).toBe(false);
  expect(isAudioRepeatAvailable({ ...ready, cycleTarget: 5 })).toBe(false);
});

it.each<AudioSession["phase"]>(["loading", "playing", "gap", "speaking", "countdown", "error", "completed"])("does not allow REPEAT during %s", phase => {
  expect(isAudioRepeatAvailable({ ...ready, phase })).toBe(false);
  expect(isAudioRepeatAvailable({ ...ready, phase: "paused", pausedPhase: "playing" })).toBe(false);
});
