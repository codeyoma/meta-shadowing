import { expect, it } from "vitest";
import { createAudioSession, transitionAudioSession, type AudioSession } from "./audio-session";

function finishRecording(session: AudioSession, durationMs: number) {
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  return transitionAudioSession(session, { type: "audio-ended", attempt: session.attempt, durationMs });
}

function finishCycle(session: AudioSession) {
  session = finishRecording(session, 2000);
  if (session.level >= 4) {
    session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 500 });
    session = finishRecording(session, 4000);
  }
  return session;
}

it.each([1, 2, 3, 4, 5] as const)("level %s adds both extra cycles once and preserves manual speaking and subtitle control", level => {
  let session = createAudioSession({ phraseCount: 3, level, groupSizes: [2, 1] });
  for (let cycle = 0; cycle < 3; cycle++) session = finishCycle(transitionAudioSession(session, { type: "space" }));
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "pause" });
  session = transitionAudioSession(session, { type: "retry" });
  expect(session).toMatchObject({ cycleTarget: 5, completedCycles: 3, groupIndex: 0, phraseIndex: 0, subtitlesRevealed: false });
  // Repeated R can restart a listen, but cannot queue another pair.
  session = transitionAudioSession(session, { type: "retry" });
  session = finishCycle(session);
  expect(session).toMatchObject({ cycleTarget: 5, completedCycles: 4, phase: "ready", remainingMs: 0, mode: "manual" });
  expect(transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 60000 })).toEqual(session);
  expect(transitionAudioSession(session, { type: "next" })).toEqual(session);
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phraseIndex: 0, completedCycles: 4, phase: "loading", subtitlesRevealed: false });
  session = finishCycle(session);
  expect(session).toMatchObject({ cycleTarget: 5, completedCycles: 5, phase: "ready" });
  session = transitionAudioSession(session, { type: "space" });
  for (const type of ["space", "retry"] as const) {
    expect(transitionAudioSession(session, { type })).toMatchObject({ cycleTarget: 3, completedCycles: 0, groupIndex: 1, phase: "ready" });
  }
});

it.each([
  { level: 1 as const, speakingMs: 3000 },
  { level: 2 as const, speakingMs: 5250 },
  { level: 3 as const, speakingMs: 3000 },
  { level: 4 as const, speakingMs: 14250 },
  { level: 5 as const, speakingMs: 8000 }
])("level $level keeps its automatic speaking window for both extras before advancing", ({ level, speakingMs }) => {
  let session = transitionAudioSession(createAudioSession({ phraseCount: 3, groupSizes: [2, 1], level, mode: "automatic", advanceDelayMs: 1000 }), { type: "space" });
  for (let cycle = 0; cycle < 3; cycle++) {
    session = finishCycle(session);
    session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: speakingMs });
  }
  expect(session).toMatchObject({ phase: "ready", completedCycles: 3 });
  session = transitionAudioSession(session, { type: "retry" });
  session = finishCycle(session);
  expect(session).toMatchObject({ phase: "speaking", remainingMs: speakingMs, completedCycles: 4 });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: speakingMs - 100 });
  session = transitionAudioSession(session, { type: "pause" });
  expect(transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 60000 })).toEqual(session);
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 100 });
  expect(session).toMatchObject({ phase: "loading", completedCycles: 4, phraseIndex: 0 });
  session = finishCycle(session);
  expect(session).toMatchObject({ phase: "speaking", remainingMs: speakingMs, completedCycles: 5 });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: speakingMs });
  expect(session).toMatchObject({ phase: "countdown", remainingMs: 1000, groupIndex: 0 });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 1000 });
  expect(session).toMatchObject({ phase: "loading", completedCycles: 0, cycleTarget: 3, groupIndex: 1 });
});

it("recovers an extra-cycle error without losing the pair and clears the pair when selecting another sentence", () => {
  let session = createAudioSession({ phraseCount: 3 });
  for (let cycle = 0; cycle < 3; cycle++) session = finishCycle(transitionAudioSession(session, { type: "space" }));
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "retry" });
  const failedAttempt = session.attempt;
  session = transitionAudioSession(session, { type: "audio-error", attempt: failedAttempt });
  session = transitionAudioSession(session, { type: "retry" });
  expect(transitionAudioSession(session, { type: "audio-ended", attempt: failedAttempt, durationMs: 2000 })).toEqual(session);
  session = finishCycle(session);
  expect(session).toMatchObject({ completedCycles: 4, cycleTarget: 5 });
  session = transitionAudioSession(session, { type: "jump", phraseIndex: 2 });
  expect(session).toMatchObject({ phraseIndex: 2, completedCycles: 0, cycleTarget: 3 });
  session = transitionAudioSession(session, { type: "previous" });
  expect(session).toMatchObject({ phraseIndex: 1, completedCycles: 0, cycleTarget: 3 });
});

it("switching the added pair to manual mode stops timed progression and preserves both extra slots", () => {
  let session = transitionAudioSession(createAudioSession({ phraseCount: 2, mode: "automatic" }), { type: "space" });
  for (let cycle = 0; cycle < 3; cycle++) {
    session = finishCycle(session);
    session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 3000 });
  }
  session = finishCycle(transitionAudioSession(session, { type: "retry" }));
  session = transitionAudioSession(session, { type: "pause" });
  session = transitionAudioSession(session, { type: "settings", mode: "manual" });
  expect(session).toMatchObject({ phase: "paused", pausedPhase: "ready", mode: "manual", completedCycles: 4, cycleTarget: 5, remainingMs: 0 });
  session = finishCycle(transitionAudioSession(session, { type: "space" }));
  expect(session).toMatchObject({ phase: "ready", completedCycles: 5, phraseIndex: 0 });
});

it("completes an automatic final phrase only after the fifth speaking window", () => {
  let session = transitionAudioSession(createAudioSession({ phraseCount: 1, mode: "automatic" }), { type: "space" });
  for (let cycle = 0; cycle < 3; cycle++) {
    session = finishCycle(session);
    session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 3000 });
  }
  session = transitionAudioSession(session, { type: "retry" });
  for (let cycle = 4; cycle <= 5; cycle++) {
    session = finishCycle(session);
    expect(session).toMatchObject({ phase: "speaking", completedCycles: cycle });
    session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 3000 });
  }
  expect(session).toMatchObject({ phase: "completed", phraseIndex: 0, completedCycles: 5 });
});
