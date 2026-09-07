import { expect, it } from "vitest";
import { createAudioSession, transitionAudioSession, type AudioSession } from "./audio-session";

function finish(session: AudioSession) {
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  return transitionAudioSession(session, { type: "audio-ended", attempt: session.attempt, durationMs: 2000 });
}

it("manual progress waits for confirmation and the third confirmation stops at Repeat/Next", () => {
  let session = transitionAudioSession(createAudioSession({ phraseCount: 2 }), { type: "space" });
  for (let count = 1; count <= 3; count++) {
    session = finish(session);
    expect(session).toMatchObject({ completedCycles: count, confirmedCycles: count - 1, phase: "ready" });
    session = transitionAudioSession(session, { type: "pause" });
    expect(session.confirmedCycles).toBe(count - 1);
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ confirmedCycles: count, groupIndex: 0, phase: count === 3 ? "ready" : "loading" });
  }
  session = transitionAudioSession(session, { type: "next" });
  expect(session).toMatchObject({ groupIndex: 1, completedCycles: 0, confirmedCycles: 0 });
});

it("replaying a finished recording does not confirm it or accumulate unchecked listens", () => {
  let session = finish(transitionAudioSession(createAudioSession({ phraseCount: 2 }), { type: "space" }));
  session = transitionAudioSession(session, { type: "retry" });
  expect(session).toMatchObject({ completedCycles: 0, confirmedCycles: 0, cycleTarget: 3 });
  session = finish(session);
  expect(session).toMatchObject({ completedCycles: 1, confirmedCycles: 0 });
  session = transitionAudioSession(session, { type: "space" });
  expect(session.confirmedCycles).toBe(1);
});

it.each([1, 2, 3, 4, 5] as const)("level %s confirms automatic progress only at the end of speaking time", level => {
  let session = finish(transitionAudioSession(createAudioSession({ phraseCount: 2, level, mode: "automatic" }), { type: "space" }));
  const attempt = session.attempt;
  const duration = session.remainingMs;
  expect(session).toMatchObject({ completedCycles: 1, confirmedCycles: 0, phase: "speaking" });
  session = transitionAudioSession(session, { type: "tick", attempt, elapsedMs: duration - 1 });
  expect(session.confirmedCycles).toBe(0);
  session = transitionAudioSession(session, { type: "pause" });
  expect(transitionAudioSession(session, { type: "tick", attempt, elapsedMs: 10000 })).toEqual(session);
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "tick", attempt, elapsedMs: 1 });
  expect(session).toMatchObject({ completedCycles: 1, confirmedCycles: 1, phase: "loading" });
  expect(transitionAudioSession(session, { type: "tick", attempt, elapsedMs: 10000 })).toEqual(session);
});

it("changing mode preserves the pending confirmation without granting a check or resuming a paused timer", () => {
  let session = finish(transitionAudioSession(createAudioSession({ phraseCount: 2 }), { type: "space" }));
  session = transitionAudioSession(session, { type: "pause" });
  session = transitionAudioSession(session, { type: "settings", mode: "automatic" });
  expect(session).toMatchObject({ phase: "paused", pausedPhase: "speaking", remainingMs: 3000, confirmedCycles: 0 });
  session = transitionAudioSession(session, { type: "settings", mode: "manual" });
  expect(session).toMatchObject({ phase: "paused", pausedPhase: "ready", remainingMs: 0, confirmedCycles: 0 });
  session = transitionAudioSession(session, { type: "settings", mode: "automatic" });
  expect(session).toMatchObject({ phase: "paused", pausedPhase: "speaking", confirmedCycles: 0 });
  expect(transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 60000 })).toEqual(session);
  session = transitionAudioSession(session, { type: "settings", mode: "manual" });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "loading", confirmedCycles: 1 });
});
