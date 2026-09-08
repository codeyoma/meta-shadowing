"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRapidSession, isRapidRunning, transitionRapidSession, type RapidEvent, type RapidLevel, type RapidLine, type RapidSettings } from "@/lib/rapid-session";
import type { Lesson } from "@/lib/lessons";
import { useLearningRecord, type LearningStart, type CloudRecording } from "./use-learning-record";

type ControlEvent = Exclude<RapidEvent, { type: "tick" }>;

export function useRapidSession(lesson: Lesson, lines: RapidLine[], level: RapidLevel, settings: RapidSettings, shortcutsEnabled: boolean, start: LearningStart, cloud?: CloudRecording) {
  const legacy = useLearningRecord(lesson, start, Boolean(cloud));
  const completion = cloud ? cloud.completion : legacy.completion;
  const storageFailed = cloud ? false : legacy.storageFailed;
  const updateRecord: CloudRecording["updateRecord"] = cloud?.updateRecord ?? legacy.updateRecord;
  const cloudRef = useRef(cloud); cloudRef.current = cloud;
  const shortcutsRef = useRef(shortcutsEnabled); shortcutsRef.current = shortcutsEnabled;
  const waiting = useRef(false);
  const pausePending = useRef(false);
  const resumeVerified = useRef(false);
  const alive = useRef(true);
  const [session, setSession] = useState(() => createRapidSession({ lines, level, settings, initialLineIndex: start.progress?.nextUnit }));
  const current = useRef(session);
  const clockAnchor = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = useCallback(function send(event?: ControlEvent) {
    if (waiting.current) { if (event?.type === "pause") pausePending.current = true; return; }
    if (cloudRef.current && event?.type !== "pause" && !cloudRef.current.canAct()) return;
    clearTimeout(timer.current);
    const now = performance.now();
    const previous = current.current;
    if (cloudRef.current && previous.paused && event && ["space","restart","next","previous"].includes(event.type) && !resumeVerified.current) {
      waiting.current = true;
      void cloudRef.current.verifyResume().then(allowed => {
        waiting.current = false;
        if (!alive.current || !allowed || !shortcutsRef.current) return;
        resumeVerified.current = true; send(event); resumeVerified.current = false;
      });
      return;
    }
    // Consume actual elapsed time, including delayed callbacks, before handling user input.
    let next = isRapidRunning(previous) && (!cloudRef.current || cloudRef.current.canAct()) ? transitionRapidSession(previous, {
      type: "tick", elapsedMs: now - clockAnchor.current, runId: previous.runId, stopAtBoundary: Boolean(cloudRef.current)
    }) : previous;
    const apply = (accepted: typeof next) => {
      if (!alive.current) return;
      if (cloudRef.current && (pausePending.current || document.hidden || !shortcutsRef.current || !cloudRef.current.canAct())) accepted = transitionRapidSession(accepted,{type:"pause"});
      pausePending.current = false;
      clockAnchor.current = performance.now();
      current.current = accepted;
      if (accepted !== previous) setSession(accepted);
      if (isRapidRunning(accepted)) timer.current = setTimeout(() => send(),Math.max(1,Math.min(100,accepted.remainingMs)));
    };
    if (cloudRef.current) {
      // A late callback may finish one line, never consume several unacknowledged units.
      if (next.boundaryCount !== previous.boundaryCount) {
        const accepted = next;
        const saved = updateRecord({ kind:"line", studied:true, elapsedMs:next.activeElapsedMs-previous.activeElapsedMs,
          checkpoint:{unit:next.checkpointIndex,phrase:next.checkpointIndex},finished:next.phase === "completed" });
        waiting.current = true;
        if (event?.type === "pause" || (event?.type === "space" && isRapidRunning(previous))) pausePending.current = true;
        void Promise.resolve(saved).then(() => {
          waiting.current = false; apply(accepted);
          // Navigation/settings still need their own acknowledgment after this line.
          if (alive.current && event && !["pause","space"].includes(event.type)) send(event);
        });
        return;
      }
      updateRecord({ elapsedMs:next.activeElapsedMs-previous.activeElapsedMs });
      const beforeEvent = next;
      if (event) next = transitionRapidSession(next,event);
      const navigation = event && ["jump","previous","next"].includes(event.type) && next !== beforeEvent;
      const saved = navigation ? updateRecord({kind:"jump",checkpoint:{unit:next.lineIndex,phrase:next.lineIndex}})
        : event?.type === "settings" ? updateRecord({settings:event.settings}) : undefined;
      if (saved instanceof Promise) {
        const accepted = next; waiting.current = true;
        void saved.then(() => { waiting.current = false; apply(accepted); });
      } else apply(next);
      return;
    }
    if (next.boundaryCount !== previous.boundaryCount) {
      updateRecord({ studied: true, elapsedMs: next.checkpointActiveMs - previous.activeElapsedMs, checkpoint: { unit: next.checkpointIndex, phrase: next.checkpointIndex }, finished: next.phase === "completed" });
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

  useEffect(() => { if (cloud?.blocked && !waiting.current) send({ type:"pause" }); },[cloud?.blocked,send]);

  useEffect(() => {
    let handledSpace = false;
    function onKeyDown(event: KeyboardEvent) {
      if (!shortcutsEnabled || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space") handledSpace = false;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, select, textarea, [contenteditable=true], [role=dialog]")) return;
      if (target instanceof HTMLElement && target.closest("button, a") && !target.closest("[data-player-shortcuts]")) return;
      const type = event.code === "Space" ? "space"
        : event.key === "ArrowRight" ? "next" : null;
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

  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);

  return { session, send, completion, storageFailed };
}
