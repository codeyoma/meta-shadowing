"use client";

import { useCallback, useRef, useState } from "react";
import type { Lesson } from "@/lib/lessons";
import { readLearningJournal, recordConfirmedPractice, saveLearningBoundary, type ProgressRecord, type CompletionRecord, type RunSelection } from "@/lib/learning-records";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { createRunId } from "@/lib/run-id";
import { resolveSessionSettings, saveSessionPreferences, type SessionSettings } from "@/lib/session-settings";

export type LearningStart = { selection: RunSelection; progress: ProgressRecord | null; completion: CompletionRecord | null };
export type RecordUpdate = {
  active?: boolean;
  elapsedMs?: number;
  checkpoint?: { unit: number; phrase: number };
  finished?: boolean;
  settings?: Partial<SessionSettings>;
  restartCompleted?: boolean;
  studied?: boolean;
  kind?: "studied" | "advance" | "jump" | "line" | "settings";
  confirmedCycles?: number;
};
export type CloudRecording = {
  completion: CompletionRecord | null;
  blocked: boolean;
  canAct: () => boolean;
  verifyResume: () => Promise<boolean>;
  updateRecord: (update: RecordUpdate) => void | Promise<void>;
  exit: (href: string) => void;
};

export function useLearningRecord(lesson: Lesson, start: LearningStart, disabled = false) {
  const [completion, setCompletion] = useState(start.completion);
  const [storageFailed, setStorageFailed] = useState(false);
  const current = useRef({ active: false, anchor: 0, activeMs: start.progress?.activeMs ?? 0,
    settings: resolveSessionSettings(start.selection), completed: !!start.completion, runId: start.selection.runId });

  const updateRecord = useCallback((update: RecordUpdate) => {
    if (disabled) return;
    const state = current.current;
    // Another tab may have completed this run since this player was mounted.
    if (update.restartCompleted && (state.completed || readLearningJournal().history.some(record => record.runId === state.runId))) {
      state.runId = createRunId();
      state.completed = false;
      state.active = false;
      state.activeMs = 0;
      setCompletion(null);
      const selection = { ...start.selection, ...state.settings, runId: state.runId };
      saveLastSelection(selection);
      window.history.replaceState(null, "", getPlayerHref(selection));
    }
    if (state.completed && !update.settings) return;
    const studySaved = !update.studied || recordConfirmedPractice();
    if (!studySaved) setStorageFailed(true);
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
      language: lesson.language, level: start.selection.level, stage: start.selection.stage, nextUnit: update.checkpoint.unit,
      nextPhrase: update.checkpoint.phrase, activeMs: state.activeMs, settings: state.settings
    };
    if (update.finished) {
      const completed = { ...record, completedAt: new Date().toISOString() };
      state.completed = true;
      state.active = false;
      setCompletion(completed);
      setStorageFailed(!saveLearningBoundary(completed) || !studySaved);
    } else setStorageFailed(!saveLearningBoundary(record) || !studySaved);
  }, [lesson, start, disabled]);

  return { completion, storageFailed, updateRecord };
}
