"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRapidSession, isRapidRunning, transitionRapidSession, type RapidEvent, type RapidLevel, type RapidLine, type RapidSettings } from "@/lib/rapid-session";
import type { Lesson } from "@/lib/lessons";
import { useLearningRecord, type LearningStart } from "./use-learning-record";

type ControlEvent = Exclude<RapidEvent, { type: "tick" }>;

export function useRapidSession(lesson: Lesson, lines: RapidLine[], level: RapidLevel, settings: RapidSettings, shortcutsEnabled: boolean, start: LearningStart) {
  const { completion, storageFailed, updateRecord } = useLearningRecord(lesson, start);
  const [session, setSession] = useState(() => createRapidSession({ lines, level, settings, initialLineIndex: start.progress?.nextUnit }));
  const current = useRef(session);
  const clockAnchor = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = useCallback(function send(event?: ControlEvent) {
    clearTimeout(timer.current);
    const now = performance.now();
    const previous = current.current;
    // Consume actual elapsed time, including delayed callbacks, before handling user input.
    let next = isRapidRunning(previous) ? transitionRapidSession(previous, {
      type: "tick", elapsedMs: now - clockAnchor.current, runId: previous.runId
    }) : previous;
    if (next.boundaryCount !== previous.boundaryCount) {
      updateRecord({ elapsedMs: next.checkpointActiveMs - previous.activeElapsedMs, checkpoint: { unit: next.checkpointIndex, phrase: next.checkpointIndex }, finished: next.phase === "completed" });
      updateRecord({ elapsedMs: next.activeElapsedMs - next.checkpointActiveMs });
    } else updateRecord({ elapsedMs: next.activeElapsedMs - previous.activeElapsedMs });
    const beforeEvent = next;
    if (event) next = transitionRapidSession(next, event);
    if (event?.type === "jump" && next !== beforeEvent) {
      updateRecord({ restartCompleted: true, checkpoint: { unit: next.lineIndex, phrase: next.lineIndex } });
    }
    if (event?.type === "settings") updateRecord({ settings: event.settings });
    clockAnchor.current = now;
    current.current = next;
    if (next !== previous) setSession(next);
    if (isRapidRunning(next)) {
      // Re-arm from the engine's remaining duration, not the React render or a rounded WPM interval.
      timer.current = setTimeout(() => send(), Math.max(1, Math.min(100, next.remainingMs)));
    }
  }, [updateRecord]);

  useEffect(() => {
    let handledSpace = false;
    function onKeyDown(event: KeyboardEvent) {
      if (!shortcutsEnabled || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space") handledSpace = false;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, select, textarea, [contenteditable=true], [role=dialog]")) return;
      if (target instanceof HTMLElement && target.closest("button, a") && !target.closest("[data-player-shortcuts]")) return;
      const type = event.code === "Space" ? "space" : event.key.toLowerCase() === "r" ? "restart"
        : event.key === "ArrowLeft" ? "previous" : event.key === "ArrowRight" ? "next" : null;
      if (!type) return;
      event.preventDefault();
      if (event.code === "Space") handledSpace = true;
      send({ type });
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space" || !handledSpace) return;
      event.preventDefault();
      handledSpace = false;
    }
    function onVisibilityChange() {
      if (document.hidden) send({ type: "pause" });
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [send, shortcutsEnabled]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { session, send, completion, storageFailed };
}
