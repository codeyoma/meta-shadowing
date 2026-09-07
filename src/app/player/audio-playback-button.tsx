"use client";

import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { PauseIcon, SpeakerIcon } from "../ui";
import styles from "./practice.module.css";

export function AudioPlaybackButton({ audioRef, playing, disabled, onClick }: {
  audioRef: RefObject<HTMLAudioElement | null>; playing: boolean; disabled: boolean; onClick: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frame = 0;
    function update() {
      // Some WebM clips do not provide a finite duration until they end.
      const value = audio!.error ? null : audio!.ended ? 100
        : Number.isFinite(audio!.duration) && audio!.duration > 0
          ? Math.round(Math.min(1, Math.max(0, audio!.currentTime / audio!.duration)) * 1000) / 10 : null;
      setProgress(value);
    }
    function tick() {
      update();
      if (!audio!.paused && !audio!.ended && !audio!.error) frame = requestAnimationFrame(tick);
    }
    function synchronize(event?: Event) {
      cancelAnimationFrame(frame);
      if (audio!.paused || audio!.ended || audio!.error || ["waiting", "pause", "ended", "emptied", "error", "loadstart"].includes(event?.type ?? "")) {
        setAudioPlaying(false);
      } else if (event?.type === "playing") {
        setAudioPlaying(true);
      }
      update();
      if (!audio!.paused && !audio!.ended && !audio!.error) frame = requestAnimationFrame(tick);
    }
    const events = ["loadedmetadata", "durationchange", "timeupdate", "seeking", "seeked", "play", "playing", "waiting", "pause", "ended", "emptied", "error", "loadstart"];
    for (const event of events) audio.addEventListener(event, synchronize);
    synchronize();
    return () => {
      cancelAnimationFrame(frame);
      for (const event of events) audio.removeEventListener(event, synchronize);
    };
  }, [audioRef]);
  const showOutline = playing && audioPlaying;

  return <div className={styles.speakerControl}>
    <Button type="button" variant={showOutline ? "audio" : "ghost"} size="icon" data-player-shortcuts aria-label="재생 또는 일시정지" aria-pressed={playing} disabled={disabled} onClick={onClick}>{playing ? <PauseIcon /> : <SpeakerIcon />}</Button>
    {showOutline ? <svg className={styles.audioOutline} viewBox="0 0 44 44" role="progressbar" aria-label="원음 재생 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-valuetext={progress === null ? "재생 길이 확인 중" : undefined}>
      <rect className={styles.audioTrack} x="1" y="1" width="42" height="42" rx="15" />
      <rect className={styles.audioFill} x="1" y="1" width="42" height="42" rx="15" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (progress ?? 0)} />
    </svg> : null}
  </div>;
}
