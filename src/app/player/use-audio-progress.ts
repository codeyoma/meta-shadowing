"use client";

import { useEffect, useState, type RefObject } from "react";

/** Media time, not elapsed wall time: pauses, buffering and speed changes stay accurate. */
export function useAudioProgress(audioRef: RefObject<HTMLAudioElement | null>, attempt: number) {
  const [progress, setProgress] = useState<number | null>(0);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frame = 0;
    let waiting = false;
    function update(event?: Event) {
      if (audio!.error || ["emptied", "loadstart", "error"].includes(event?.type ?? "")) {
        setProgress(0);
      } else if (audio!.ended) {
        setProgress(100);
      } else {
        // Some WebM recordings have no finite duration until they finish.
        setProgress(Number.isFinite(audio!.duration) && audio!.duration > 0
          ? Math.round(Math.min(1, Math.max(0, audio!.currentTime / audio!.duration)) * 1000) / 10
          : null);
      }
    }
    function tick() {
      update();
      if (!waiting && !audio!.paused && !audio!.ended && !audio!.error) frame = requestAnimationFrame(tick);
    }
    function synchronize(event?: Event) {
      cancelAnimationFrame(frame);
      if (["waiting", "emptied", "loadstart", "error"].includes(event?.type ?? "")) waiting = true;
      if (event?.type === "playing") waiting = false;
      update(event);
      if (!waiting && !audio!.paused && !audio!.ended && !audio!.error) frame = requestAnimationFrame(tick);
    }
    const events = ["loadedmetadata", "durationchange", "timeupdate", "seeking", "seeked", "play", "playing", "waiting", "pause", "ended", "emptied", "error", "loadstart"];
    for (const event of events) audio.addEventListener(event, synchronize);
    synchronize();
    return () => {
      cancelAnimationFrame(frame);
      for (const event of events) audio.removeEventListener(event, synchronize);
    };
  }, [audioRef, attempt]);
  return progress;
}
