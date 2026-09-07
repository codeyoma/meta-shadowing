import { expect, it } from "vitest";
import { createAudioSession, transitionAudioSession } from "./audio-session";
import { createRapidSession, transitionRapidSession } from "./rapid-session";

it.each([1, 2, 3, 4, 5] as const)("jumping in level %i resets practice and rejects stale audio callbacks", level => {
  const grouped = level >= 4;
  let session = createAudioSession({ phraseCount: 7, level, groupSizes: [2, 3, 2], mode: "automatic", playbackRate: 2 });
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  session = { ...session, completedCycles: 2, subtitlesRevealed: true, groupDurationMs: 2000 };
  const staleAttempt = session.attempt;
  const next = transitionAudioSession(session, { type: "jump", phraseIndex: 4 });
  expect(next).toMatchObject({ groupIndex: grouped ? 1 : 4, phraseIndex: grouped ? 2 : 4, phase: "ready", completedCycles: 0,
    subtitlesRevealed: false, groupDurationMs: 0, remainingMs: 0, mode: "automatic", playbackRate: 2 });
  expect(next.attempt).toBeGreaterThan(staleAttempt);
  expect(transitionAudioSession(next, { type: "audio-ended", attempt: staleAttempt, durationMs: 4000 })).toEqual(next);
  expect(transitionAudioSession(next, { type: "jump", phraseIndex: 0 })).toMatchObject({ groupIndex: 0, phraseIndex: 0, phase: "ready" });
});

const lines = ["One", "Two", "Three"].map(target => ({ target: [target, "word"], korean: ["한", "문장"], chapter: null, boundary: null }));
it.each([6, 7, 8] as const)("jumping in level %i waits for input and does not earn a completed-line boundary", level => {
  let session = createRapidSession({ lines, level, settings: { mode: "automatic", wpmLevel: 6 } });
  session = transitionRapidSession(session, { type: "space" });
  session = transitionRapidSession(session, { type: "tick", runId: session.runId, elapsedMs: 100 });
  const next = transitionRapidSession(session, { type: "jump", lineIndex: 2 });
  expect(next).toMatchObject({ lineIndex: 2, phase: "ready", tokenIndex: 0, remainingMs: 0, paused: false,
    activeElapsedMs: 100, boundaryCount: 0, settings: { mode: "automatic", wpmLevel: 6 } });
  expect(next.runId).toBeGreaterThan(session.runId);
  expect(transitionRapidSession(next, { type: "tick", runId: session.runId, elapsedMs: 5000 })).toEqual(next);
  expect(transitionRapidSession(next, { type: "jump", lineIndex: 0 })).toMatchObject({ lineIndex: 0, phase: "ready" });
});

it.each([-1, 3, 1.5, NaN, Infinity])("ignores invalid jump index %s", index => {
  const audio = createAudioSession({ phraseCount: 3 });
  const rapid = createRapidSession({ lines, level: 6 });
  expect(transitionAudioSession(audio, { type: "jump", phraseIndex: index })).toBe(audio);
  expect(transitionRapidSession(rapid, { type: "jump", lineIndex: index })).toBe(rapid);
});

it("can select a sentence after completion without carrying its old completed state", () => {
  const audio = { ...createAudioSession({ phraseCount: 3 }), phase: "completed" as const, completedCycles: 3 };
  const rapid = { ...createRapidSession({ lines, level: 8 }), phase: "completed" as const };
  expect(transitionAudioSession(audio, { type: "jump", phraseIndex: 1 })).toMatchObject({ phraseIndex: 1, phase: "ready", completedCycles: 0 });
  expect(transitionRapidSession(rapid, { type: "jump", lineIndex: 1 })).toMatchObject({ lineIndex: 1, phase: "ready" });
});
