import { expect, it } from "vitest";
import { parsePracticeCommand } from "./cloud-practice";

const id = "00000000-0000-4000-8000-000000000020";
const owned = { accountId: id, instance: id, runId: id, generation: 1 };
it("requires an observed run generation and an operation ID for explicit takeover", () => {
  const takeover = { ...owned, action: "takeover", operation: id };
  expect(parsePracticeCommand(takeover)).toEqual(takeover);
  for (const patch of [{ generation: 0 }, { operation: undefined }, { runId: undefined }, { force: true }, { settings: { mode: "manual" } }]) {
    expect(parsePracticeCommand({ ...takeover, ...patch })).toBeNull();
  }
});
it("accepts every existing level but never a client unit plan or starting settings", () => {
  for (let level = 1; level <= 8; level++) {
    const start = { action: "start", accountId: id, instance: id, operation: id, lessonId: id, lessonVersion: "2026-09-08T00:00:00Z", level, stage: level * 2 };
    expect(parsePracticeCommand(start)).toEqual(start);
    expect(parsePracticeCommand({ ...start, units: [0, 1] })).toBeNull();
    expect(parsePracticeCommand({ ...start, settings: { mode: "automatic" } })).toBeNull();
  }
});
it("accepts a rapid line boundary and strictly validated current-run settings", () => {
  const checkpoint = { ...owned, action: "checkpoint", operation: id, revision: 1, kind: "line", nextUnit: 1, activeMs: 400 };
  expect(parsePracticeCommand(checkpoint)).toEqual(checkpoint);
  const settings = { ...checkpoint, kind: "settings", nextUnit: 0, settings: { mode: "automatic", speed: 2 } };
  expect(parsePracticeCommand(settings)).toEqual(settings);
  for (const patch of [{ speed: 99 }, { groupSize: 4 }, { surprise: true }, {}]) {
    expect(parsePracticeCommand({ ...settings, settings: patch })).toBeNull();
  }
  expect(parsePracticeCommand({ ...checkpoint, settings: { speed: 2 } })).toBeNull();
});
