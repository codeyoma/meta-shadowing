"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioSession, transitionAudioSession, type AudioSessionEvent, type AudioSessionSettings } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";

export function useAudioSession(lesson: PublishedLesson, settings: AudioSessionSettings) {
  const [session, setSession] = useState(() => createAudioSession({ phraseCount: lesson.phrases.length, ...settings }));
  const currentSession = useRef(session);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playRequest = useRef(0);
  const [mediaTime, setMediaTime] = useState({ elapsed: 0, duration: 0 });

  const send = useCallback(function send(event: AudioSessionEvent) {
    const previous = currentSession.current;
    const next = transitionAudioSession(previous, event);
    if (next === previous) return;
    currentSession.current = next;
    setSession(next);

    const audio = audioRef.current;
    if (!audio) return;
    if (next.attempt !== previous.attempt) {
      playRequest.current++;
      audio.onplaying = audio.onended = audio.onerror = audio.onpause = null;
      audio.ontimeupdate = audio.ondurationchange = null;
      audio.pause();
      setMediaTime({ elapsed: 0, duration: 0 });

      if (next.phase !== "loading") {
        audio.removeAttribute("src");
        audio.load();
        return;
      }

      const attempt = next.attempt;
      const phrase = lesson.phrases[next.phraseIndex];
      audio.src = `/api/lessons/${lesson.id}/audio/${phrase.phraseNumber}?attempt=${attempt}`;
      audio.load();
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
      const updateTime = () => {
        if (currentSession.current.attempt !== attempt) return;
        setMediaTime({ elapsed: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      };
      audio.ontimeupdate = audio.ondurationchange = updateTime;
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
  }, [lesson]);

  useEffect(() => {
    if (session.phase !== "speaking" && session.phase !== "countdown") return;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      send({ type: "tick", elapsedMs: now - lastTick, attempt: session.attempt });
      lastTick = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [session.phase, session.attempt, send]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, select, textarea, [contenteditable=true], [role=dialog]")) return;
      if (target instanceof HTMLElement && target.closest("button, a") && !target.closest("[data-player-shortcuts]")) return;
      const type = event.code === "Space" ? "space" : event.key.toLowerCase() === "r" ? "retry"
        : event.key === "ArrowLeft" ? "previous" : event.key === "ArrowRight" ? "next" : null;
      if (!type) return;
      event.preventDefault();
      send({ type });
    }
    function onVisibilityChange() {
      if (document.hidden) send({ type: "pause" });
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [send]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      playRequest.current++;
      if (!audio) return;
      audio.onplaying = audio.onended = audio.onerror = audio.onpause = null;
      audio.ontimeupdate = audio.ondurationchange = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  return { session, send, audioRef, mediaTime };
}
