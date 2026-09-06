"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { hasSessionTimer, type AudioPracticeLevel, type AudioSessionSettings } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import { AudioSessionControls } from "../audio-session-controls";
import { BackIcon, Brand, GearIcon, Page, PauseIcon, PlayIcon } from "../ui";
import { useAudioSession } from "./use-audio-session";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function AudioPhrasePlayer({ lesson, level, settings, hints }: { lesson: PublishedLesson; level: AudioPracticeLevel; settings: AudioSessionSettings; hints: SubtitleHint[] }) {
  const router = useRouter();
  const { session, send, audioRef, mediaTime } = useAudioSession(lesson, level, settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const phrase = lesson.phrases[session.phraseIndex];
  const hintOnly = level === 3 && !session.subtitlesRevealed;
  const subtitle = hintOnly ? hints[session.phraseIndex] : phrase;
  const complete = session.phase === "completed";
  const active = ["loading", "playing", "speaking", "countdown"].includes(session.phase);
  const playing = ["loading", "playing"].includes(session.phase);
  const timed = hasSessionTimer(session);
  const actionLabel = playing ? "일시정지" : session.phase === "paused" ? "계속 재생"
    : session.phase === "error" ? "다시 시도" : session.completedCycles >= 3 ? "다음 프레이즈"
    : session.completedCycles === 0 ? "첫 원음 듣기" : "다음 원음 듣기";
  const status = session.phase === "loading" ? "원음을 불러오는 중"
    : session.phase === "playing" ? "원음을 듣고 따라 말해 보세요."
    : session.phase === "paused" ? "일시정지됨"
    : session.phase === "speaking" ? (level === 2 ? "자막을 보며 말하고, 눈을 감고 한 번 더 말해 보세요." : "들은 문장을 말해 보세요.")
    : session.phase === "countdown" ? "곧 다음 프레이즈로 이동합니다."
    : session.completedCycles >= 3 ? "말하기를 마쳤다면 다음으로, 더 연습하려면 다시 듣기."
    : level === 2 ? "듣고, 자막을 보며 말한 뒤 눈을 감고 한 번 더 말해 보세요." : "듣고 말한 뒤 다음 원음을 시작하세요.";
  const progress = complete ? lesson.phrases.length : session.phraseIndex;

  return (
    <Page className="player-page audio-phrase-player">
      <header className="player-topbar">
        <button type="button" aria-label="레슨으로 돌아가기" className="icon-button" onClick={() => router.push("/home")}><BackIcon /></button>
        <Brand />
        <button type="button" aria-label="학습 설정" aria-expanded={settingsOpen} aria-controls="player-settings" className="icon-button" onClick={() => {
          if (!settingsOpen) send({ type: "pause" });
          setSettingsOpen(!settingsOpen);
        }}><GearIcon /></button>
      </header>
      <div className="player-progress">
        <span>{session.phraseIndex + 1} / {lesson.phrases.length}</span>
        <div role="progressbar" aria-label="프레이즈 진행" aria-valuemin={0} aria-valuemax={lesson.phrases.length} aria-valuenow={progress}>
          <i style={{ width: `${progress / lesson.phrases.length * 100}%` }} />
        </div>
      </div>
      <header className="chapter-header"><strong>{lesson.name}</strong><span>{lesson.localizedName}</span></header>
      <section className="practice-shell" aria-labelledby="player-title">
        <h1 id="player-title">메타쉐도잉 레벨 {level}</h1>
        <audio ref={audioRef} preload="none" />
        {settingsOpen ? <section id="player-settings" className="player-settings" aria-label="학습 설정">
          <h2>세션 설정</h2>
          <AudioSessionControls settings={session} onChange={(value) => send({ type: "settings", ...value })} />
          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>설정 닫기</button>
        </section> : null}
        {complete ? (
          <div className="practice-canvas completion-canvas">
            <h2>레벨 {level} 학습 완료</h2>
            <p>{lesson.phrases.length}개 프레이즈를 모두 연습했어요.</p>
            <button type="button" className="primary-button" onClick={() => router.push("/home")}>레슨 목록으로</button>
          </div>
        ) : (
          <>
            <div id="practice-subtitles" role="region" aria-label="학습 자막" className={`practice-canvas${hintOnly ? " hint-only" : ""}`}><span lang={lesson.language === "english" ? "en" : "ja"}>{subtitle.target}</span><small lang="ko">{subtitle.korean}</small></div>
            <div className="playback-line">
              <span>{formatTime(mediaTime.elapsed)}</span>
              <div role="progressbar" aria-label="원음 재생 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mediaTime.duration ? Math.round(mediaTime.elapsed / mediaTime.duration * 100) : 0}>
                <b style={{ width: `${mediaTime.duration ? mediaTime.elapsed / mediaTime.duration * 100 : 0}%` }} />
              </div>
              <span>{formatTime(mediaTime.duration)}</span>
            </div>
            <p className="cycle-status" aria-label="완료한 듣기">필수 <strong>{Math.min(3, session.completedCycles)} / 3</strong>{session.completedCycles > 3 ? <> · 추가 <strong>{session.completedCycles - 3} / 2</strong></> : null}</p>
            <div className="session-meta">
              <p className="session-mode">{session.mode === "automatic" ? "자동" : "수동"} · {session.playbackRate}×</p>
              {timed ? <p className="session-timer" role="timer" aria-label="남은 시간">{(session.remainingMs / 1000).toFixed(1)}초</p> : null}
            </div>
            {session.phase === "error" ? (
              <div className="playback-error" role="alert" aria-label="원음 재생 오류"><p>원음을 재생할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.</p><button type="button" className="secondary-button" onClick={() => send({ type: "retry" })}>다시 시도</button></div>
            ) : <p className="session-status" role="status">{status}</p>}
            <div className={`player-actions${level === 3 ? " with-subtitles" : ""}`} data-player-shortcuts>
              {level === 3 ? <button type="button" aria-label="자막 보기" aria-expanded={session.subtitlesRevealed} aria-controls="practice-subtitles" onClick={() => send({ type: "reveal-subtitles" })}>자막 보기<kbd>S</kbd></button> : null}
              <button type="button" onClick={() => send({ type: "retry" })}>{session.completedCycles >= 5 ? "다음 프레이즈" : "다시 듣기"}<kbd>R</kbd></button>
              <button type="button" className="continue" aria-label={actionLabel} onClick={() => send({ type: "space" })}>{actionLabel}<kbd>Space</kbd></button>
            </div>
          </>
        )}
      </section>
      {!complete ? <nav className="playback-dock" aria-label="재생 제어" data-player-shortcuts>
        <button type="button" disabled={session.phraseIndex === 0} onClick={() => send({ type: "previous" })}>이전<kbd>←</kbd></button>
        <button type="button" className="dock-play" aria-label="재생 또는 일시정지" onClick={() => send({ type: active ? "pause" : "space" })}>{active ? <PauseIcon /> : <PlayIcon />}</button>
        <button type="button" disabled={session.completedCycles < 3} onClick={() => send({ type: "next" })}>다음<kbd>→</kbd></button>
      </nav> : null}
    </Page>
  );
}
