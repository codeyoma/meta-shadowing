import { expect, it } from "vitest";
import { createRapidSession, rapidDisplay, transitionRapidSession } from "./rapid-session";

const lines = [
  { target: ["Good", "morning."], korean: ["좋은", "아침입니다."], boundary: null, chapter: null },
  { target: ["Welcome."], korean: ["환영합니다."], boundary: null, chapter: null }
] as const;

it("resumes at the next complete line and counts only consumed active time, even on a late final tick", () => {
  let session = createRapidSession({ lines, level: 6, initialLineIndex: 1 });
  expect(session).toMatchObject({ lineIndex: 1, phase: "ready", activeElapsedMs: 0 });
  session = transitionRapidSession(session, { type: "space" });
  session = tick(session, 10000);
  expect(session).toMatchObject({ phase: "completed", activeElapsedMs: 600, checkpointIndex: 2, boundaryCount: 1 });
});

function tick(session: ReturnType<typeof createRapidSession>, elapsedMs: number) {
  return transitionRapidSession(session, { type: "tick", elapsedMs, runId: session.runId });
}

it("runs every target and Korean token at 200 WPM before stopping at the manual line boundary", () => {
  let session = createRapidSession({ lines, level: 6 });
  expect(rapidDisplay(session)).toBeNull();
  session = transitionRapidSession(session, { type: "space" });
  expect(rapidDisplay(session)).toMatchObject({ language: "target", text: "Good" });
  session = transitionRapidSession(session, { type: "tick", elapsedMs: 299, runId: session.runId });
  expect(rapidDisplay(session)?.text).toBe("Good");
  session = transitionRapidSession(session, { type: "tick", elapsedMs: 1, runId: session.runId });
  expect(rapidDisplay(session)?.text).toBe("morning.");
  session = transitionRapidSession(session, { type: "tick", elapsedMs: 300, runId: session.runId });
  expect(rapidDisplay(session)).toMatchObject({ language: "korean", text: "좋은" });
  session = transitionRapidSession(session, { type: "tick", elapsedMs: 300, runId: session.runId });
  expect(rapidDisplay(session)?.text).toBe("아침입니다.");
  session = transitionRapidSession(session, { type: "tick", elapsedMs: 10000, runId: session.runId });
  expect(session).toMatchObject({ phase: "line-complete", lineIndex: 0 });
  session = transitionRapidSession(session, { type: "space" });
  expect(session.lineIndex).toBe(1);
  expect(rapidDisplay(session)?.text).toBe("Welcome.");
});

it.each([[3, 200], [4, 267], [5, 333], [6, 400]] as const)("uses speed level %i at %i WPM without rounding token durations", (wpmLevel, wpm) => {
  let session = createRapidSession({ lines, level: 6, settings: { wpmLevel } });
  session = transitionRapidSession(session, { type: "space" });
  expect(session.remainingMs).toBeCloseTo(60000 / wpm);
  session = transitionRapidSession(session, { type: "tick", elapsedMs: 120000 / wpm, runId: session.runId });
  expect(rapidDisplay(session)).toMatchObject({ language: "korean", text: "좋은" });
});

it.each([7, 8] as const)("starts level %i with Korean, then allows target-line duration plus the speaking pause", (level) => {
  let session = transitionRapidSession(createRapidSession({ lines, level }), { type: "space" });
  expect(rapidDisplay(session)).toMatchObject({ language: "korean", text: "좋은" });
  session = tick(session, 600);
  expect(session).toMatchObject({ phase: "speaking", remainingMs: 1100 });
  expect(rapidDisplay(session)).toBeNull();
  session = tick(session, 1099);
  expect(session.phase).toBe("speaking");
  session = tick(session, 1);
  if (level === 7) {
    expect(rapidDisplay(session)).toMatchObject({ language: "target", text: "Good" });
    session = tick(session, 600);
  } else expect(rapidDisplay(session)).toBeNull();
  expect(session.phase).toBe("line-complete");
});

it("uses the selected WPM and configurable extra pause for speaking, not the Korean line length", () => {
  const unequal = [{ ...lines[0], korean: ["안녕하세요."] }];
  let session = transitionRapidSession(createRapidSession({ lines: unequal, level: 8, settings: { wpmLevel: 6, speakingExtraMs: 800 } }), { type: "space" });
  session = tick(session, 150);
  expect(session).toMatchObject({ phase: "speaking", remainingMs: 1100 });
  session = tick(session, 1100);
  expect(session.phase).toBe("completed");
  expect(rapidDisplay(session)).toBeNull();
});

it("pauses a partial token, ignores stale ticks, and resumes its remaining time", () => {
  let session = transitionRapidSession(createRapidSession({ lines, level: 6 }), { type: "space" });
  session = tick(session, 100);
  const oldRunId = session.runId;
  session = transitionRapidSession(session, { type: "space" });
  expect(session).toMatchObject({ paused: true, remainingMs: 200 });
  expect(tick(session, 10000)).toEqual(session);
  session = transitionRapidSession(session, { type: "space" });
  expect(session.paused).toBe(false);
  expect(transitionRapidSession(session, { type: "tick", elapsedMs: 10000, runId: oldRunId })).toEqual(session);
  session = tick(session, 199);
  expect(rapidDisplay(session)?.text).toBe("Good");
  expect(rapidDisplay(tick(session, 1))?.text).toBe("morning.");
});

it("restarts from the first token and navigates without changing a paused or idle user's playback intent", () => {
  let session = createRapidSession({ lines, level: 7 });
  expect(transitionRapidSession(session, { type: "previous" })).toEqual(session);
  session = transitionRapidSession(session, { type: "next" });
  expect(session).toMatchObject({ phase: "ready", lineIndex: 1 });
  session = transitionRapidSession(session, { type: "space" });
  session = transitionRapidSession(session, { type: "previous" });
  expect(rapidDisplay(session)?.text).toBe("좋은");
  session = tick(session, 600);
  session = transitionRapidSession(session, { type: "pause" });
  expect(session).toMatchObject({ phase: "speaking", paused: true });
  session = transitionRapidSession(session, { type: "next" });
  expect(session).toMatchObject({ phase: "korean", lineIndex: 1, paused: true });
  expect(transitionRapidSession(session, { type: "next" })).toEqual(session);
  session = transitionRapidSession(session, { type: "restart" });
  expect(session).toMatchObject({ phase: "korean", tokenIndex: 0, paused: false, remainingMs: 300 });
  session = tick(session, 9999);
  expect(session.phase).toBe("completed");
  expect(transitionRapidSession(session, { type: "space" })).toEqual(session);
  expect(transitionRapidSession(session, { type: "restart" })).toMatchObject({ phase: "korean", lineIndex: 1 });
});

it.each([null, "section", "chapter"] as const)("automatically waits the applicable %s boundary gap and can pause that gap", (boundary) => {
  let session = transitionRapidSession(createRapidSession({ lines: [lines[0], { ...lines[1], boundary }], level: 6, settings: { mode: "automatic", lineGapMs: 700, sectionGapMs: 1500 } }), { type: "space" });
  session = tick(session, 1200);
  const gap = boundary ? 1500 : 700;
  expect(session).toMatchObject({ phase: "gap", remainingMs: gap, lineIndex: 0 });
  session = tick(session, gap - 1);
  session = transitionRapidSession(session, { type: "space" });
  expect(tick(session, 9999)).toEqual(session);
  session = transitionRapidSession(session, { type: "space" });
  session = tick(session, 1);
  expect(session).toMatchObject({ phase: "target", lineIndex: 1 });
  session = tick(session, 600);
  expect(session.phase).toBe("completed");
});

it("carries elapsed time across automatic boundaries, including zero gaps, without carrying it across manual stops", () => {
  let session = transitionRapidSession(createRapidSession({ lines, level: 8, settings: { mode: "automatic", lineGapMs: 0, speakingExtraMs: 0 } }), { type: "space" });
  session = tick(session, 1350);
  expect(session).toMatchObject({ lineIndex: 1, phase: "korean", remainingMs: 150 });
  expect(tick(session, 99999).phase).toBe("completed");
});

it("accumulates only tokens in the current language stage and resets on restart", () => {
  let session = transitionRapidSession(createRapidSession({ lines, level: 6, settings: { display: "cumulative" } }), { type: "space" });
  session = tick(session, 300);
  expect(rapidDisplay(session)?.text).toBe("Good morning.");
  session = tick(session, 300);
  expect(rapidDisplay(session)?.text).toBe("좋은");
  session = tick(session, 300);
  expect(rapidDisplay(session)?.text).toBe("좋은 아침입니다.");
  session = transitionRapidSession(session, { type: "restart" });
  expect(rapidDisplay(session)?.text).toBe("Good");
});

it("preserves fractional progress when changing speed or speaking time while paused", () => {
  let session = transitionRapidSession(createRapidSession({ lines, level: 7 }), { type: "space" });
  session = tick(session, 150);
  session = transitionRapidSession(session, { type: "pause" });
  session = transitionRapidSession(session, { type: "settings", settings: { wpmLevel: 6, display: "cumulative" } });
  expect(session).toMatchObject({ paused: true, remainingMs: 75, tokenIndex: 0 });
  session = transitionRapidSession(session, { type: "space" });
  session = tick(session, 225 + 400);
  expect(session).toMatchObject({ phase: "speaking", remainingMs: 400 });
  session = transitionRapidSession(session, { type: "pause" });
  session = transitionRapidSession(session, { type: "settings", settings: { speakingExtraMs: 1700 } });
  expect(session).toMatchObject({ paused: true, remainingMs: 1000 });
});

it("changing automatic to manual cancels a pending line gap without skipping the line", () => {
  let session = transitionRapidSession(createRapidSession({ lines, level: 6, settings: { mode: "automatic" } }), { type: "space" });
  session = tick(session, 1200);
  session = transitionRapidSession(session, { type: "settings", settings: { mode: "manual" } });
  expect(session).toMatchObject({ phase: "line-complete", lineIndex: 0, remainingMs: 0 });
  expect(tick(session, 99999)).toEqual(session);
  expect(transitionRapidSession(session, { type: "space" })).toMatchObject({ phase: "target", lineIndex: 1 });
});

it("rejects invalid durations and ticks, and safely handles an empty lesson", () => {
  let session = createRapidSession({ lines, level: 6, settings: { speakingExtraMs: -1, lineGapMs: NaN, sectionGapMs: Infinity } });
  expect(session.settings).toMatchObject({ speakingExtraMs: 500, lineGapMs: 1000, sectionGapMs: 2000 });
  session = transitionRapidSession(session, { type: "space" });
  for (const elapsedMs of [NaN, Infinity, -1, 0]) expect(tick(session, elapsedMs)).toEqual(session);
  expect(transitionRapidSession(session, { type: "settings", settings: { lineGapMs: 30001 } }).settings.lineGapMs).toBe(1000);
  const empty = createRapidSession({ lines: [], level: 8 });
  for (const type of ["space", "restart", "previous", "next"] as const) expect(transitionRapidSession(empty, { type })).toEqual(empty);
  expect(empty.phase).toBe("completed");
});
