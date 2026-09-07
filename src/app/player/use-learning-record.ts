"use client";

import { useCallback, useRef, useState } from "react";
import type { Lesson } from "@/lib/lessons";
import { readLearningJournal, saveLearningBoundary, type ProgressRecord, type CompletionRecord, type RunSelection } from "@/lib/learning-records";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { resolveSessionSettings, saveSessionPreferences, type SessionSettings } from "@/lib/session-settings";

export type LearningStart = { selection: RunSelection; progress: ProgressRecord | null; completion: CompletionRecord | null };
type RecordUpdate = {
  active?: boolean;
  elapsedMs?: number;
  checkpoint?: { unit: number; phrase: number };
  finished?: boolean;
  settings?: Partial<SessionSettings>;
  restartCompleted?: boolean;
};

export function useLearningRecord(lesson: Lesson, start: LearningStart) {
  const [completion, setCompletion] = useState(start.completion);
  const [storageFailed, setStorageFailed] = useState(false);
  const current = useRef({ active: false, anchor: 0, activeMs: start.progress?.activeMs ?? 0,
    settings: resolveSessionSettings(start.selection), completed: !!start.completion, runId: start.selection.runId });

  const updateRecord = useCallback((update: RecordUpdate) => {
    const state = current.current;
    // Another tab may have completed this run since this player was mounted.
    if (update.restartCompleted && (state.completed || readLearningJournal().history.some(record => record.runId === state.runId))) {
      state.runId = crypto.randomUUID();
      state.completed = false;
      state.active = false;
      state.activeMs = 0;
      setCompletion(null);
      const selection = { ...start.selection, ...state.settings, runId: state.runId };
      saveLastSelection(selection);
      window.history.replaceState(null, "", getPlayerHref(selection));
    }
    if (state.completed && !update.settings) return;
    const now = performance.now();
    if (state.active) state.activeMs += Math.max(0, now - state.anchor);
    state.activeMs += update.elapsedMs ?? 0;
    state.anchor = now;
    state.active = update.active ?? false;
    if (update.settings) {
      state.settings = resolveSessionSettings(update.settings, state.settings);
      saveSessionPreferences(update.settings);
      const selection = { ...start.selection, ...state.settings, runId: state.runId };
      saveLastSelection(selection);
      window.history.replaceState(null, "", getPlayerHref(selection));
    }
    if (!update.checkpoint) return;
    const record: ProgressRecord = {
      runId: state.runId, lessonId: lesson.id, lessonVersion: lesson.version, lessonName: lesson.name,
      language: lesson.language, level: start.selection.level, nextUnit: update.checkpoint.unit,
      nextPhrase: update.checkpoint.phrase, activeMs: state.activeMs, settings: state.settings
    };
    if (update.finished) {
      const completed = { ...record, completedAt: new Date().toISOString() };
      state.completed = true;
      state.active = false;
      setCompletion(completed);
      setStorageFailed(!saveLearningBoundary(completed));
    } else setStorageFailed(!saveLearningBoundary(record));
  }, [lesson, start]);

  return { completion, storageFailed, updateRecord };
}
