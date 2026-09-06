import { expect, it } from "vitest";
import { createAudioSession, transitionAudioSession, type AudioSession } from "./audio-session";

function finishRecording(session: AudioSession, durationMs: number) {
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  return transitionAudioSession(session, { type: "audio-ended", attempt: session.attempt, durationMs });
}

function finishPair(session: AudioSession) {
  session = finishRecording(session, 2000);
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 500 });
  return finishRecording(session, 4000);
}

it("resumes the first recording of a saved group with fresh cycles and a configurable recording gap", () => {
  let session = createAudioSession({ phraseCount: 5, level: 4, groupSizes: [2, 3], initialGroupIndex: 1, groupGapMs: 1500 });
  expect(session).toMatchObject({ groupIndex: 1, phraseIndex: 2, completedCycles: 0, phase: "ready" });
  session = finishRecording(transitionAudioSession(session, { type: "space" }), 2000);
  expect(session).toMatchObject({ phraseIndex: 2, remainingMs: 1500, phase: "gap" });
});

it("can explicitly pause manual speaking time after a completed recording", () => {
  let session = createAudioSession({ phraseCount: 1 });
  session = finishRecording(transitionAudioSession(session, { type: "space" }), 2000);
  session = transitionAudioSession(session, { type: "pause" });
  expect(session.phase).toBe("paused");
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "loading", completedCycles: 1 });
});

it("counts a group only after both recordings finish with a half-second gap", () => {
  let session = createAudioSession({ phraseCount: 3, level: 4, groupSizes: [2, 1] });
  session = transitionAudioSession(session, { type: "space" });
  session = finishRecording(session, 2000);
  expect(session).toMatchObject({ phase: "gap", phraseIndex: 0, completedCycles: 0, remainingMs: 500 });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 499 });
  expect(session).toMatchObject({ phase: "gap", phraseIndex: 0, remainingMs: 1 });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 1 });
  expect(session).toMatchObject({ phase: "loading", phraseIndex: 1, completedCycles: 0 });
  session = finishRecording(session, 4000);
  expect(session).toMatchObject({ phase: "ready", phraseIndex: 1, groupIndex: 0, completedCycles: 1 });
});

it("keeps the entire level 5 group revealed across recordings and hides it at the next cycle", () => {
  let session = createAudioSession({ phraseCount: 3, level: 5, groupSizes: [2, 1] });
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  expect(session.subtitlesRevealed).toBe(true);
  session = finishRecording(session, 2000);
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 500 });
  expect(session).toMatchObject({ phraseIndex: 1, subtitlesRevealed: true });
  session = finishRecording(session, 4000);
  expect(session.subtitlesRevealed).toBe(true);
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phraseIndex: 0, subtitlesRevealed: false, completedCycles: 1 });
  session = finishPair(session);
  session = finishPair(transitionAudioSession(session, { type: "space" }));
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ groupIndex: 1, phraseIndex: 2, subtitlesRevealed: false });
});

it("repeats the entire group three plus two times and navigates between groups, including a singleton remainder", () => {
  let session = createAudioSession({ phraseCount: 3, level: 4, groupSizes: [2, 1] });
  for (let cycle = 1; cycle <= 3; cycle++) {
    session = transitionAudioSession(session, { type: "space" });
    expect(session.phraseIndex).toBe(0);
    session = finishPair(session);
    expect(session.completedCycles).toBe(cycle);
  }
  expect(transitionAudioSession(session, { type: "space" })).toMatchObject({
    groupIndex: 1, phraseIndex: 2, completedCycles: 0, phase: "ready"
  });
  for (const cycle of [4, 5]) {
    session = finishPair(transitionAudioSession(session, { type: "retry" }));
    expect(session.completedCycles).toBe(cycle);
  }
  session = transitionAudioSession(session, { type: "retry" });
  expect(session).toMatchObject({ groupIndex: 1, phraseIndex: 2, completedCycles: 0, phase: "ready" });
  expect(transitionAudioSession(session, { type: "previous" })).toMatchObject({ groupIndex: 0, phraseIndex: 0, completedCycles: 0 });
  for (let cycle = 0; cycle < 3; cycle++) session = finishRecording(transitionAudioSession(session, { type: "space" }), 1000);
  expect(transitionAudioSession(session, { type: "space" }).phase).toBe("completed");
});

it("pauses the inter-recording gap and restarts an interrupted or failed group without counting or hiding its reveal", () => {
  let session = createAudioSession({ phraseCount: 2, level: 5, groupSizes: [2] });
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = finishRecording(session, 2000);
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 200 });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "paused", pausedPhase: "gap", remainingMs: 300, completedCycles: 0 });
  expect(transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 5000 })).toEqual(session);
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 300 });
  expect(session).toMatchObject({ phase: "loading", phraseIndex: 1 });
  const abandonedAttempt = session.attempt;
  session = transitionAudioSession(session, { type: "retry" });
  expect(session).toMatchObject({ phase: "loading", phraseIndex: 0, completedCycles: 0, subtitlesRevealed: true });
  expect(transitionAudioSession(session, { type: "audio-ended", attempt: abandonedAttempt, durationMs: 4000 })).toEqual(session);
  session = transitionAudioSession(session, { type: "audio-error", attempt: session.attempt });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "loading", phraseIndex: 0, completedCycles: 0, subtitlesRevealed: true });
  session = finishPair(session);
  expect(session).toMatchObject({ phase: "ready", completedCycles: 1 });
});

it.each([
  { level: 4 as const, playbackRate: 1, expectedMs: 14250 },
  { level: 4 as const, playbackRate: 2, expectedMs: 7500 },
  { level: 5 as const, playbackRate: 1, expectedMs: 8000 },
  { level: 5 as const, playbackRate: 2, expectedMs: 4250 }
])("level $level at $playbackRate× sizes the speaking window from both recordings", ({ level, playbackRate, expectedMs }) => {
  let session = createAudioSession({ phraseCount: 3, level, groupSizes: [2, 1], mode: "automatic", playbackRate });
  session = finishPair(transitionAudioSession(session, { type: "space" }));
  expect(session).toMatchObject({ phase: "speaking", completedCycles: 1, remainingMs: expectedMs });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: expectedMs });
  expect(session).toMatchObject({ phase: "loading", phraseIndex: 0, subtitlesRevealed: false });
  session = finishPair(session);
  expect(session.remainingMs).toBe(expectedMs);
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: expectedMs });
  session = finishPair(session);
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: expectedMs });
  expect(session).toMatchObject({ phase: "countdown", remainingMs: 1000, completedCycles: 3 });
  expect(transitionAudioSession(session, { type: "retry" })).toMatchObject({ phase: "loading", groupIndex: 0, phraseIndex: 0 });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 1000 });
  expect(session).toMatchObject({ phase: "loading", groupIndex: 1, phraseIndex: 2, completedCycles: 0 });
});
