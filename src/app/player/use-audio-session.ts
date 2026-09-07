"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioSession, transitionAudioSession, type AudioPracticeLevel, type AudioSessionEvent, type AudioSessionSettings } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";
import type { PhraseGroup } from "@/lib/phrase-groups";
import { useLearningRecord, type LearningStart } from "./use-learning-record";
import { createAudioPreloader } from "@/lib/audio-preloader";
import { createSuccessChime } from "@/lib/success-chime";

function detachAudioListeners(audio: HTMLAudioElement) {
  audio.onplaying = audio.onended = audio.onerror = audio.onpause = null;
}

export function useAudioSession(lesson: PublishedLesson, level: AudioPracticeLevel, settings: AudioSessionSettings, groups: PhraseGroup[], shortcutsEnabled: boolean, start: LearningStart) {
  const { completion, storageFailed, updateRecord } = useLearningRecord(lesson, start);
  const [session, setSession] = useState(() => createAudioSession({ phraseCount: lesson.phrases.length, groupSizes: groups.map(group => group.phrases.length), level, ...settings, initialGroupIndex: start.progress?.nextUnit }));
  const currentSession = useRef(session);
  const audioRef = useRef<HTMLAudioElement>(null);
  const preloader = useRef<ReturnType<typeof createAudioPreloader> | null>(null);
  const playRequest = useRef(0);
  const successChime = useRef<ReturnType<typeof createSuccessChime> | null>(null);

  const prepareAudio = useCallback((index: number, refresh = false) => {
    if (!audioRef.current) return;
    preloader.current ??= createAudioPreloader(audioRef.current, lesson.phrases.map(phrase =>
      `/api/lessons/${lesson.id}/audio/${phrase.phraseNumber}?version=${encodeURIComponent(lesson.version)}`));
    preloader.current.select(index, refresh);
  }, [lesson]);

  const send = useCallback(function send(event: AudioSessionEvent) {
    const previous = currentSession.current;
    const next = transitionAudioSession(previous, event);
    if (next === previous) return;
    if (["space", "next", "retry"].includes(event.type)) {
      successChime.current ??= createSuccessChime();
      successChime.current.unlock();
    }
    if (next.groupIndex === previous.groupIndex && previous.confirmedCycles < 3 && next.confirmedCycles === 3) successChime.current?.play();
    const finished = next.phase === "completed";
    const boundary = finished || event.type === "jump" || next.groupIndex > previous.groupIndex;
    const studied = next.groupIndex === previous.groupIndex && next.confirmedCycles > previous.confirmedCycles;
    if (boundary) successChime.current?.cancelPending();
    updateRecord({
      restartCompleted: event.type === "jump",
      studied,
      active: shortcutsEnabled && !document.hidden && (["playing", "gap", "speaking", "countdown"].includes(next.phase) || (next.phase === "ready" && next.completedCycles > 0)),
      ...(boundary || studied ? { checkpoint: { unit: finished ? next.groupSizes.length : next.groupIndex,
        phrase: finished ? lesson.phrases.length : studied && groups.length ? groups[next.groupIndex].phrases[0].phraseNumber - 1 : next.phraseIndex }, finished } : {}),
      ...(event.type === "settings" ? { settings: {
        ...(event.mode !== undefined ? { mode: next.mode } : {}), ...(event.playbackRate !== undefined ? { speed: next.playbackRate } : {}),
        ...(event.advanceDelayMs !== undefined ? { advanceDelayMs: next.advanceDelayMs } : {}), ...(event.groupGapMs !== undefined ? { groupGapMs: next.groupGapMs } : {})
      } } : {})
    });
    currentSession.current = next;
    setSession(next);

    const audio = audioRef.current;
    if (!audio) return;
    if (next.attempt !== previous.attempt) {
      playRequest.current++;
      detachAudioListeners(audio);
      audio.pause();

      if (next.phase !== "loading") {
        if (finished) {
          preloader.current?.dispose();
          preloader.current = null;
        } else prepareAudio(next.phraseIndex);
        return;
      }

      const attempt = next.attempt;
      prepareAudio(next.phraseIndex, previous.phase === "error");
      audio.onplaying = () => {
        if (!audio.paused) send({ type: "audio-playing", attempt });
      };
      audio.onended = () => {
        if (!audio.ended) return;
        // WebM may have no duration metadata until playback ends.
        const duration = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime;
        send({ type: "audio-ended", attempt, durationMs: duration * 1000 });
      };
      audio.onerror = () => {
        if (audio.error) send({ type: "audio-error", attempt });
      };
      audio.onpause = () => {
        if (!audio.ended && audio.paused && currentSession.current.attempt === attempt) send({ type: "pause" });
      };
    }

    audio.playbackRate = next.playbackRate;
    if (next.phase === "loading" && (previous.phase !== "loading" || next.attempt !== previous.attempt)) {
      const request = ++playRequest.current;
      // Keep play() in the keyboard/touch action to preserve mobile user activation.
      void audio.play().catch(() => {
        if (request === playRequest.current) send({ type: "audio-error", attempt: next.attempt });
      });
    } else if (["paused", "error", "completed"].includes(next.phase)) {
      playRequest.current++;
      audio.pause();
    }
  }, [lesson, groups, shortcutsEnabled, updateRecord, prepareAudio]);

  useEffect(() => {
    if (!["gap", "speaking", "countdown"].includes(session.phase)) return;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      send({ type: "tick", elapsedMs: now - lastTick, attempt: session.attempt });
      lastTick = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [session.phase, session.attempt, send]);

  useEffect(() => {
    let handledSpace = false;
    function onKeyDown(event: KeyboardEvent) {
      if (!shortcutsEnabled || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space") handledSpace = false;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, select, textarea, [contenteditable=true], [role=dialog]")) return;
      if (target instanceof HTMLElement && target.closest("button, a") && !target.closest("[data-player-shortcuts]")) return;
      // The speaker's native Space activation must use its replay/pause click action.
      if (event.code === "Space" && target instanceof HTMLElement && target.closest("button[data-player-shortcuts]")) return;
      const type = event.code === "Space" ? "space" : event.key.toLowerCase() === "r" ? "retry"
        : event.key.toLowerCase() === "s" ? "reveal-subtitles"
        : event.key === "ArrowRight" ? "next" : null;
      if (!type) return;
      event.preventDefault();
      if (event.code === "Space") handledSpace = true;
      send({ type });
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space" || !handledSpace) return;
      // Mobile Chrome can still activate a focused button on keyup after a consumed keydown.
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

  useEffect(() => {
    const audio = audioRef.current;
    prepareAudio(currentSession.current.phraseIndex);
    return () => {
      playRequest.current++;
      successChime.current?.dispose();
      successChime.current = null;
      if (!audio) return;
      detachAudioListeners(audio);
      preloader.current?.dispose();
      preloader.current = null;
    };
  }, [prepareAudio]);

  return { session, send, audioRef, completion, storageFailed };
}
