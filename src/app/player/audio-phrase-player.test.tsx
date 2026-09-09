import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAudioSession, transitionAudioSession, type AudioSession, type AudioSessionEvent } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";
import { DEFAULT_SESSION_SETTINGS } from "@/lib/session-settings";
import { AudioPhrasePlayer } from "./audio-phrase-player";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Keep the real player and reducer. Only replace the browser media/storage hook
// so tests can reach a precise recording boundary without decoding audio in jsdom.
let session: AudioSession;
const audioRef: RefObject<HTMLAudioElement | null> = { current: null };
vi.mock("./use-audio-session", () => ({
  useAudioSession: () => ({
    session,
    send: (event: AudioSessionEvent) => { session = transitionAudioSession(session, event); },
    audioRef,
    completion: null,
    storageFailed: false
  })
}));

const phrases: PublishedLesson["phrases"] = [
  { kind: "phrase", sourceLine: 1, phraseNumber: 1, target: "First phrase.", korean: "첫 문장." },
  { kind: "phrase", sourceLine: 2, phraseNumber: 2, target: "Second phrase.", korean: "둘째 문장." }
];
const lesson: PublishedLesson = {
  id: "speaker-test", version: "v1", language: "english", name: "Speaker test", localizedName: "스피커 테스트",
  phraseCount: 2, sectionCount: 0, entries: phrases, phrases
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  session = createAudioSession({ phraseCount: 2 });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render() {
  act(() => root.render(createElement(AudioPhrasePlayer, {
    lesson, level: session.level, settings: session, hints: phrases,
    cloud: { completion: null, blocked: false, canAct: () => true, verifyResume: async () => true, updateRecord: vi.fn(), exit: vi.fn() },
    groups: phrases.map(phrase => ({ phrases: [phrase], chapter: null, startsSection: false })),
    start: { progress: null, completion: null, selection: {
      ...DEFAULT_SESSION_SETTINGS, lessonId: lesson.id, language: lesson.language, level: 1, runId: "speaker-test-run"
    } }
  })));
}

function send(event: AudioSessionEvent) {
  session = transitionAudioSession(session, event);
}

function finishRecording() {
  send({ type: "audio-playing", attempt: session.attempt });
  send({ type: "audio-ended", attempt: session.attempt, durationMs: 2000 });
}

function startExtraPair(mode: "manual" | "automatic" = "manual") {
  session = createAudioSession({ phraseCount: 2, mode });
  send({ type: "space" });
  for (let cycle = 0; cycle < 3; cycle++) {
    finishRecording();
    if (mode === "automatic") send({ type: "tick", attempt: session.attempt, elapsedMs: 3000 });
    else send({ type: "space" });
  }
  send({ type: "retry" });
}

function clickPrimary() {
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="학습 진행"] button:last-child')!.click());
  render();
}

it("offers only the primary playback action and confirms a finished listen once", () => {
  send({ type: "space" });
  finishRecording();
  render();
  expect(container.querySelector('[aria-label="재생 또는 일시정지"]')).toBeNull();
  clickPrimary();
  expect(session).toMatchObject({ phase: "loading", cycleTarget: 3, completedCycles: 1, confirmedCycles: 1 });
  finishRecording();
  render();
  expect(container.querySelector('[aria-label="완료한 듣기"]')?.textContent).toBe("필수 1 / 3");
});

it.each([false, true])("confirms both extra listens from Continue and offers Next (paused ready: %s)", paused => {
  startExtraPair();
  for (const extra of [1, 2]) {
    finishRecording();
    if (paused) send({ type: "pause" });
    render();
    clickPrimary();
    expect(container.querySelector('[aria-label="완료한 듣기"]')?.textContent).toBe(`필수 3 / 3 · 추가 ${extra} / 2`);
    expect(session).toMatchObject({ confirmedCycles: extra + 3, completedCycles: extra + 3, phase: extra === 1 ? "loading" : "ready", groupIndex: 0 });
  }
  expect(container.querySelector('[aria-label="재생 또는 일시정지"]')).toBeNull();
  expect(session).toMatchObject({ confirmedCycles: 5, groupIndex: 0 });
  act(() => container.querySelector<HTMLButtonElement>('[aria-label^="NEXT"]')!.click());
  render();
  expect(session).toMatchObject({ groupIndex: 1, confirmedCycles: 0, cycleTarget: 3 });
});

it("a second primary click pauses the next extra listen without granting another check", () => {
  startExtraPair();
  finishRecording();
  render();
  clickPrimary();
  const nextAttempt = session.attempt;
  clickPrimary();
  expect(session).toMatchObject({ phase: "paused", pausedPhase: "loading", completedCycles: 4, confirmedCycles: 4, attempt: nextAttempt });
  send({ type: "audio-ended", attempt: nextAttempt - 1, durationMs: 2000 });
  clickPrimary();
  expect(session).toMatchObject({ phase: "loading", confirmedCycles: 4, attempt: nextAttempt });
  finishRecording();
  render();
  clickPrimary();
  expect(session).toMatchObject({ phase: "ready", confirmedCycles: 5 });
});

it("an automatic extra listen stays unchecked until its speaking timer finishes", () => {
  startExtraPair("automatic");
  finishRecording();
  render();
  expect(session).toMatchObject({ phase: "speaking", completedCycles: 4, confirmedCycles: 3 });
  send({ type: "tick", attempt: session.attempt, elapsedMs: 2999 });
  expect(session).toMatchObject({ phase: "speaking", confirmedCycles: 3 });
  send({ type: "tick", attempt: session.attempt, elapsedMs: 1 });
  expect(session).toMatchObject({ phase: "loading", confirmedCycles: 4 });
});
