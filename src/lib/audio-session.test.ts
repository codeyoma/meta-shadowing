import { describe, expect, it } from "vitest";
import { createAudioSession, transitionAudioSession } from "./audio-session";

function finishListen(session: ReturnType<typeof createAudioSession>, durationMs = 4000) {
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  return transitionAudioSession(session, { type: "audio-ended", attempt: session.attempt, durationMs });
}

it.each([
  { level: 1 as const, playbackRate: 1, expectedMs: 5500 },
  { level: 2 as const, playbackRate: 1, expectedMs: 9750 },
  { level: 2 as const, playbackRate: 2, expectedMs: 5250 },
  { level: 3 as const, playbackRate: 1, expectedMs: 5500 },
  { level: 3 as const, playbackRate: 2, expectedMs: 3000 }
])("level $level at $playbackRate× allows $expectedMs ms to speak after a four-second recording", ({ level, playbackRate, expectedMs }) => {
  const session = createAudioSession({ phraseCount: 2, level, playbackRate, mode: "automatic" });
  expect(finishListen(transitionAudioSession(session, { type: "space" }))).toMatchObject({
    phase: "speaking", remainingMs: expectedMs, completedCycles: 1
  });
});

it("keeps level 3 subtitles revealed through pause and the end of a listen, then hides them for the next cycle", () => {
  let session = createAudioSession({ phraseCount: 2, level: 3 });
  expect(session.subtitlesRevealed).toBe(false);
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "paused", subtitlesRevealed: true });
  session = transitionAudioSession(session, { type: "space" });
  session = finishListen(session);
  expect(session).toMatchObject({ phase: "ready", subtitlesRevealed: true, completedCycles: 1 });
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "loading", subtitlesRevealed: false });
});

it.each(["space", "next"] as const)("resets level 3 hints when %s advances to another phrase and when returning to the previous phrase", (type) => {
  let session = createAudioSession({ phraseCount: 2, level: 3 });
  for (let cycle = 0; cycle < 3; cycle++) session = finishListen(transitionAudioSession(session, { type: "space" }));
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type });
  expect(session).toMatchObject({ phraseIndex: 1, subtitlesRevealed: false, completedCycles: 0 });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "previous" });
  expect(session).toMatchObject({ phraseIndex: 0, subtitlesRevealed: false, completedCycles: 0 });
});

it.each([2, 3] as const)("level %s retains the three required plus two extra limit and does not count a restarted or failed attempt", (level) => {
  let session = createAudioSession({ phraseCount: 2, level });
  session = transitionAudioSession(session, { type: "space" });
  const interrupted = session.attempt;
  session = transitionAudioSession(session, { type: "retry" });
  session = transitionAudioSession(session, { type: "audio-ended", attempt: interrupted, durationMs: 4000 });
  session = transitionAudioSession(session, { type: "audio-error", attempt: session.attempt });
  expect(session.completedCycles).toBe(0);
  for (let cycle = 1; cycle <= 5; cycle++) {
    if (session.phase === "ready") session = transitionAudioSession(session, { type: "reveal-subtitles" });
    session = transitionAudioSession(session, { type: cycle <= 3 ? "space" : "retry" });
    expect(session).toMatchObject({ phase: "loading", subtitlesRevealed: false, phraseIndex: 0 });
    session = finishListen(session);
    expect(session).toMatchObject({ phase: "ready", completedCycles: cycle, remainingMs: 0 });
  }
  session = transitionAudioSession(session, { type: "retry" });
  expect(session).toMatchObject({ phraseIndex: 1, completedCycles: 0, subtitlesRevealed: false });
});

it("hides level 3 subtitles when an automatic speaking window starts the next cycle", () => {
  let session = createAudioSession({ phraseCount: 2, level: 3, mode: "automatic" });
  session = finishListen(transitionAudioSession(session, { type: "space" }));
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 5400 });
  expect(session).toMatchObject({ phase: "speaking", subtitlesRevealed: true });
  session = transitionAudioSession(session, { type: "tick", attempt: session.attempt, elapsedMs: 100 });
  expect(session).toMatchObject({ phase: "loading", subtitlesRevealed: false, completedCycles: 1 });
});

it.each(["playing", "error"] as const)("preserves level 3 reveal when restarting a %s attempt, until the next completed cycle", (phase) => {
  let session = createAudioSession({ phraseCount: 2, level: 3 });
  session = transitionAudioSession(session, { type: "space" });
  session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
  session = transitionAudioSession(session, { type: "reveal-subtitles" });
  if (phase === "error") session = transitionAudioSession(session, { type: "audio-error", attempt: session.attempt });
  session = transitionAudioSession(session, { type: phase === "error" ? "space" : "retry" });
  expect(session).toMatchObject({ phase: "loading", completedCycles: 0, subtitlesRevealed: true });
  session = finishListen(session);
  session = transitionAudioSession(session, { type: "space" });
  expect(session).toMatchObject({ phase: "loading", completedCycles: 1, subtitlesRevealed: false });
});

describe("level 1 audio session", () => {
  it("counts only a finished listen, then lets Space and R start the remaining required listens", () => {
    let session = createAudioSession({ phraseCount: 2 });
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ phase: "loading", completedCycles: 0 });

    session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
    session = transitionAudioSession(session, { type: "audio-ended", attempt: session.attempt, durationMs: 4000 });
    expect(session).toMatchObject({ phase: "ready", completedCycles: 1, phraseIndex: 0 });

    for (const action of ["space", "retry"] as const) {
      session = transitionAudioSession(session, { type: action });
      session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
      session = transitionAudioSession(session, { type: "audio-ended", attempt: session.attempt, durationMs: 4000 });
    }
    expect(session).toMatchObject({ phase: "ready", completedCycles: 3, phraseIndex: 0 });
  });

  it("allows skipping extras after three but uses Space to finish an added pair before advancing", () => {
    let session = createAudioSession({ phraseCount: 2 });
    for (let cycle = 0; cycle < 3; cycle++) {
      session = finishListen(transitionAudioSession(session, { type: "space" }));
    }
    expect(transitionAudioSession(session, { type: "space" })).toMatchObject({
      phase: "ready", phraseIndex: 1, completedCycles: 0
    });
    session = finishListen(transitionAudioSession(session, { type: "retry" }));
    expect(session.completedCycles).toBe(4);
    expect(transitionAudioSession(session, { type: "space" })).toMatchObject({ phraseIndex: 0, phase: "loading" });
    session = finishListen(transitionAudioSession(session, { type: "space" }));
    expect(session.completedCycles).toBe(5);
    for (const type of ["space", "retry"] as const) {
      expect(transitionAudioSession(session, { type })).toMatchObject({
        phraseIndex: 1, completedCycles: 0, phase: "ready"
      });
    }
  });

  it("finishes the lesson after the final phrase instead of requesting a nonexistent recording", () => {
    let session = createAudioSession({ phraseCount: 1 });
    for (let cycle = 0; cycle < 3; cycle++) {
      session = finishListen(transitionAudioSession(session, { type: "space" }));
    }
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ phase: "completed", phraseIndex: 0, completedCycles: 3 });
    expect(transitionAudioSession(session, { type: "retry" })).toEqual(session);
  });

  it("pauses and resumes without counting, and rejects callbacks from a restarted attempt", () => {
    let session = transitionAudioSession(createAudioSession({ phraseCount: 2 }), { type: "space" });
    const abandonedAttempt = session.attempt;
    session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ phase: "paused", completedCycles: 0 });
    expect(finishListen(session).completedCycles).toBe(0);
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ phase: "loading", attempt: abandonedAttempt });
    session = transitionAudioSession(session, { type: "retry" });
    expect(session).toMatchObject({ phase: "loading", completedCycles: 0 });
    expect(session.attempt).toBeGreaterThan(abandonedAttempt);
    session = transitionAudioSession(session, { type: "audio-ended", attempt: abandonedAttempt, durationMs: 4000 });
    expect(session.completedCycles).toBe(0);
    session = finishListen(session);
    expect(session.completedCycles).toBe(1);
    expect(finishListen(session).completedCycles).toBe(1);
  });

  it("keeps an audio error uncounted and retries the same phrase", () => {
    let session = transitionAudioSession(createAudioSession({ phraseCount: 2 }), { type: "space" });
    session = transitionAudioSession(session, { type: "audio-error", attempt: session.attempt });
    expect(session).toMatchObject({ phase: "error", completedCycles: 0, phraseIndex: 0 });
    expect(finishListen(session).completedCycles).toBe(0);
    session = transitionAudioSession(session, { type: "retry" });
    expect(finishListen(session)).toMatchObject({ phase: "ready", completedCycles: 1, phraseIndex: 0 });
  });

  it("waits for a choice after three automatic listens and starts the delay only after Next", () => {
    let session = createAudioSession({ phraseCount: 2, mode: "automatic", advanceDelayMs: 2000 });
    session = transitionAudioSession(session, { type: "space" });
    for (let cycle = 1; cycle <= 3; cycle++) {
      session = finishListen(session);
      expect(session).toMatchObject({ phase: "speaking", remainingMs: 5500, completedCycles: cycle });
      session = transitionAudioSession(session, { type: "tick", elapsedMs: 5500, attempt: session.attempt });
    }
    expect(session).toMatchObject({ phase: "ready", remainingMs: 0, completedCycles: 3 });
    expect(transitionAudioSession(session, { type: "tick", elapsedMs: 60000, attempt: session.attempt })).toEqual(session);
    session = transitionAudioSession(session, { type: "next" });
    expect(session).toMatchObject({ phase: "countdown", remainingMs: 2000, phraseIndex: 0 });
    session = transitionAudioSession(session, { type: "tick", elapsedMs: 750, attempt: session.attempt });
    session = transitionAudioSession(session, { type: "pause" });
    expect(session).toMatchObject({ phase: "paused", remainingMs: 1250 });
    expect(transitionAudioSession(session, { type: "tick", elapsedMs: 8000, attempt: session.attempt })).toEqual(session);
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ phase: "countdown", remainingMs: 1250 });
    const cancelledTimer = session.attempt;
    session = transitionAudioSession(session, { type: "retry" });
    expect(session).toMatchObject({ phase: "loading", completedCycles: 3, phraseIndex: 0 });
    expect(transitionAudioSession(session, { type: "tick", elapsedMs: 5000, attempt: cancelledTimer })).toEqual(session);
    session = finishListen(session);
    session = transitionAudioSession(session, { type: "tick", elapsedMs: 5500, attempt: session.attempt });
    expect(session).toMatchObject({ phase: "loading", completedCycles: 4, phraseIndex: 0 });
    session = finishListen(session);
    session = transitionAudioSession(session, { type: "tick", elapsedMs: 5500, attempt: session.attempt });
    expect(session).toMatchObject({ phase: "countdown", completedCycles: 5, remainingMs: 2000 });
    session = transitionAudioSession(session, { type: "tick", elapsedMs: 2000, attempt: session.attempt });
    expect(session).toMatchObject({ phase: "loading", phraseIndex: 1, completedCycles: 0 });
  });

  it("uses the selected playback rate for speaking time and rejects unsupported rates", () => {
    let session = createAudioSession({ phraseCount: 2, mode: "automatic", playbackRate: 2 });
    session = finishListen(transitionAudioSession(session, { type: "space" }));
    expect(session.remainingMs).toBe(3000);
    session = transitionAudioSession(session, { type: "settings", playbackRate: 3 });
    expect(session.playbackRate).toBe(3);
    for (const rate of [0, 0.6, 3.25, NaN, Infinity]) {
      expect(transitionAudioSession(session, { type: "settings", playbackRate: rate }).playbackRate).toBe(3);
    }
    session = transitionAudioSession(session, { type: "settings", mode: "manual" });
    expect(session).toMatchObject({ phase: "ready", remainingMs: 0, completedCycles: 1 });
  });

  it("does not skip required listens, and previous cancels playback without carrying cycles backward", () => {
    let session = createAudioSession({ phraseCount: 2 });
    expect(transitionAudioSession(session, { type: "next" })).toEqual(session);
    expect(transitionAudioSession(session, { type: "previous" })).toEqual(session);
    for (let cycle = 0; cycle < 3; cycle++) {
      session = finishListen(transitionAudioSession(session, { type: "space" }));
    }
    session = transitionAudioSession(session, { type: "next" });
    session = transitionAudioSession(session, { type: "space" });
    session = transitionAudioSession(session, { type: "audio-playing", attempt: session.attempt });
    session = transitionAudioSession(session, { type: "pause" });
    expect(session.phase).toBe("paused");
    session = transitionAudioSession(session, { type: "previous" });
    expect(session).toMatchObject({ phase: "ready", phraseIndex: 0, completedCycles: 0 });
    expect(finishListen(session).completedCycles).toBe(0);
  });

  it("lets Space explicitly advance from the automatic choice when the delay is zero", () => {
    let session = createAudioSession({ phraseCount: 2, mode: "automatic", advanceDelayMs: 0 });
    session = transitionAudioSession(session, { type: "space" });
    for (let cycle = 0; cycle < 3; cycle++) {
      session = finishListen(session);
      session = transitionAudioSession(session, { type: "tick", elapsedMs: 5500, attempt: session.attempt });
    }
    expect(transitionAudioSession(session, { type: "space" })).toMatchObject({
      phraseIndex: 1, completedCycles: 0, phase: "loading"
    });
  });

  it("retries a failed extra listen with Space without losing the completed required listens", () => {
    let session = createAudioSession({ phraseCount: 2 });
    for (let cycle = 0; cycle < 3; cycle++) {
      session = finishListen(transitionAudioSession(session, { type: "space" }));
    }
    session = transitionAudioSession(session, { type: "retry" });
    session = transitionAudioSession(session, { type: "audio-error", attempt: session.attempt });
    session = transitionAudioSession(session, { type: "space" });
    expect(session).toMatchObject({ phase: "loading", phraseIndex: 0, completedCycles: 3 });
    expect(finishListen(session).completedCycles).toBe(4);
  });
});
