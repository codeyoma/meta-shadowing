"use client";

import { useRef, useState } from "react";
import type { PublishedLesson } from "@/lib/lessons";
import type { AudioSessionSettings } from "@/lib/audio-session";
import { BackIcon, Brand, GearIcon, Page, PauseIcon, PlayIcon } from "../ui";
import { LevelOnePlayer } from "./level-one-player";

export function PlayerShell({ lesson, level, settings }: { lesson: PublishedLesson; level: number; settings: AudioSessionSettings }) {
  if (level === 1) return <LevelOnePlayer key={`${lesson.id}:${settings.mode}:${settings.playbackRate}:${settings.advanceDelayMs}`} lesson={lesson} settings={settings} />;
  return <PreviewPlayer lesson={lesson} level={level} />;
}

function PreviewPlayer({ lesson, level }: { lesson: PublishedLesson; level: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const firstPhrase = lesson.phrases[0];

  async function toggleFirstAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaybackError("");
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaybackError("원음을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <Page className="player-page">
      <header className="player-topbar"><button aria-label="이전" className="icon-button"><BackIcon /></button><Brand /><button aria-label="설정" className="icon-button"><GearIcon /></button></header>
      <div className="player-progress"><span>1 / {lesson.phraseCount}</span><div><i /></div></div>
      <header className="chapter-header"><strong>{lesson.name}</strong><span>{lesson.localizedName}</span></header>
      <section className="practice-shell" aria-labelledby="player-title">
        <h1 id="player-title">메타쉐도잉 레벨 {level}</h1>
        <div className="practice-canvas"><span>{firstPhrase.target}</span><small>{firstPhrase.korean}</small></div>
        <audio
          ref={audioRef}
          src={`/api/lessons/${lesson.id}/audio/1`}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        <div className="playback-line"><i /><span>00:00.0</span><div><b /></div><span>00:03.2</span></div>
        <p className="cycle-status">필수 <strong>1 / 3</strong></p>
        {playbackError ? <p className="playback-error" role="alert">{playbackError}</p> : null}
        <div className="player-actions">
          <button>자막 보기</button><button type="button" onClick={toggleFirstAudio}>첫 원음 듣기</button><button className="continue">계속</button>
        </div>
      </section>
      <nav className="playback-dock" aria-label="재생 제어"><button>이전</button><button type="button" className="dock-play" aria-label="재생 또는 일시정지" onClick={toggleFirstAudio}>{playing ? <PauseIcon /> : <PlayIcon />}</button><button>다음</button></nav>
    </Page>
  );
}
