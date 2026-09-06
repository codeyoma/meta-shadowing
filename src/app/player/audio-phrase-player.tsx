"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasSessionTimer, type AudioPracticeLevel, type AudioSessionSettings } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import type { PhraseGroup } from "@/lib/phrase-groups";
import { AudioSessionControls } from "../audio-session-controls";
import { BackIcon, Brand, GearIcon, Page, PauseIcon, PlayIcon, SubtitleIcon } from "../ui";
import { useAudioSession } from "./use-audio-session";
import type { LearningStart } from "./use-learning-record";
import { CompletionSummary } from "../completion-summary";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function AudioPhrasePlayer({ lesson, level, settings, hints, groups, start }: { lesson: PublishedLesson; level: AudioPracticeLevel; settings: AudioSessionSettings; hints: SubtitleHint[]; groups: PhraseGroup[]; start: LearningStart }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { session, send, audioRef, mediaTime, completion, storageFailed } = useAudioSession(lesson, level, settings, groups, !settingsOpen, start);
  const canvasRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLLIElement>(null);
  const grouped = level === 4 || level === 5;
  const group = groups[session.groupIndex];
  const hintLevel = level === 3 || level === 5;
  const twoSpeakingTurns = level === 2 || level === 4;
  const phrase = lesson.phrases[session.phraseIndex];
  const hintOnly = hintLevel && !session.subtitlesRevealed;
  const subtitle = hintOnly ? hints[session.phraseIndex] : phrase;
  const complete = session.phase === "completed";
  const active = ["loading", "playing", "gap", "speaking", "countdown"].includes(session.phase);
  const playing = ["loading", "playing", "gap"].includes(session.phase);
  const highlightPhrase = playing || (session.phase === "paused" && ["loading", "playing", "gap"].includes(session.pausedPhase));
  const timed = hasSessionTimer(session);
  const nextLabel = grouped ? "다음 묶음" : "다음 프레이즈";
  const actionLabel = playing ? "일시정지" : session.phase === "paused" ? "계속 재생"
    : session.phase === "error" ? "다시 시도" : session.completedCycles >= 3 ? nextLabel
    : session.completedCycles === 0 ? "첫 원음 듣기" : "다음 원음 듣기";
  const status = session.phase === "loading" ? "원음을 불러오는 중"
    : session.phase === "playing" ? "원음을 듣고 따라 말해 보세요."
    : session.phase === "gap" ? "다음 문장까지 잠시 기다립니다."
    : session.phase === "paused" ? "일시정지됨"
    : session.phase === "speaking" ? (twoSpeakingTurns ? "자막을 보며 말하고, 눈을 감고 한 번 더 말해 보세요." : "들은 문장을 말해 보세요.")
    : session.phase === "countdown" ? (grouped ? "곧 다음 묶음으로 이동합니다." : "곧 다음 프레이즈로 이동합니다.")
    : session.completedCycles >= 3 ? "말하기를 마쳤다면 다음으로, 더 연습하려면 다시 듣기."
    : twoSpeakingTurns ? "듣고, 자막을 보며 말한 뒤 눈을 감고 한 번 더 말해 보세요." : "듣고 말한 뒤 다음 원음을 시작하세요.";
  const progressCount = grouped ? groups.length : lesson.phrases.length;
  const progressIndex = grouped ? session.groupIndex : session.phraseIndex;
  const progress = complete ? progressCount : progressIndex;

  useEffect(() => {
    const canvas = canvasRef.current;
    const line = currentLineRef.current;
    if (!grouped || !canvas || !line) return;
    const pane = canvas.getBoundingClientRect();
    const row = line.getBoundingClientRect();
    if (row.top < pane.top || row.bottom > pane.bottom) canvas.scrollTop += row.top - pane.top - 12;
  }, [grouped, session.phraseIndex, session.groupIndex, hintOnly]);

  return (
    <Page className={`player-page audio-phrase-player${grouped ? " grouped-player" : ""}`}>
      <header className="player-topbar">
        <button type="button" aria-label="레슨으로 돌아가기" className="icon-button" onClick={() => router.push("/home")}><BackIcon /></button>
        <Brand />
        <button type="button" aria-label="학습 설정" aria-expanded={settingsOpen} aria-controls="player-settings" className="icon-button" onClick={() => {
          if (!settingsOpen) send({ type: "pause" });
          setSettingsOpen(!settingsOpen);
        }}><GearIcon /></button>
      </header>
      <div className="player-progress">
        <span>{grouped ? "묶음 " : ""}{progressIndex + 1} / {progressCount}{grouped ? ` · ${group.phrases.length}문장` : ""}</span>
        <div role="progressbar" aria-label={grouped ? "묶음 진행" : "프레이즈 진행"} aria-valuemin={0} aria-valuemax={progressCount} aria-valuenow={progress}>
          <i style={{ width: `${progress / progressCount * 100}%` }} />
        </div>
      </div>
      {!grouped || group.chapter || group.startsSection ? <header className="chapter-header" aria-label={grouped ? "현재 챕터" : undefined}>
        {grouped ? <>
          {group.chapter ? <><strong>{group.chapter.target}</strong><span>{group.chapter.korean}</span></> : null}
          {group.startsSection ? <hr className="section-divider" aria-label="구간 경계" /> : null}
        </> : <><strong>{lesson.name}</strong><span>{lesson.localizedName}</span></>}
      </header> : null}
      <section className="practice-shell" aria-labelledby="player-title">
        <h1 id="player-title">메타쉐도잉 레벨 {level}</h1>
        <audio ref={audioRef} preload="none" />
        {settingsOpen ? <section id="player-settings" className="player-settings" aria-label="학습 설정">
          <h2>세션 설정</h2>
          <AudioSessionControls level={level} settings={session} onChange={(value) => send({ type: "settings", ...value })} />
          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>설정 닫기</button>
        </section> : null}
        {completion ? <CompletionSummary record={completion} storageFailed={storageFailed} onHome={() => router.push("/home")} /> : !settingsOpen ? (
          <>
            <div ref={canvasRef} id="practice-subtitles" role="region" aria-label="학습 자막" className={`practice-canvas${hintOnly ? " hint-only" : ""}${grouped ? " group-canvas" : ""}`}>
              {grouped ? <ol className="group-phrases" aria-label="묶음 프레이즈">
                {group.phrases.map(line => {
                  const text = hintOnly ? hints[line.phraseNumber - 1] : line;
                  return <li key={line.phraseNumber} ref={phrase.phraseNumber === line.phraseNumber ? currentLineRef : undefined} aria-current={highlightPhrase && phrase.phraseNumber === line.phraseNumber ? "true" : undefined}>
                    <span lang={lesson.language === "english" ? "en" : "ja"}>{text.target}</span><small lang="ko">{text.korean}</small>
                  </li>;
                })}
              </ol> : <><span lang={lesson.language === "english" ? "en" : "ja"}>{subtitle.target}</span><small lang="ko">{subtitle.korean}</small></>}
            </div>
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
            <div className={`player-actions${hintLevel ? " with-subtitles" : ""}`} data-player-shortcuts>
              {hintLevel ? <button type="button" aria-label="자막 보기" aria-expanded={session.subtitlesRevealed} aria-controls="practice-subtitles" onClick={() => send({ type: "reveal-subtitles" })}><span className="subtitle-label"><SubtitleIcon />자막 보기</span><kbd>S</kbd></button> : null}
              <button type="button" onClick={() => send({ type: "retry" })}>{session.completedCycles >= 5 ? nextLabel : "다시 듣기"}<kbd>R</kbd></button>
              <button type="button" className="continue" aria-label={actionLabel} onClick={() => send({ type: "space" })}>{actionLabel}<kbd>Space</kbd></button>
            </div>
          </>
        ) : null}
      </section>
      {!complete && !settingsOpen ? <nav className="playback-dock" aria-label="재생 제어" data-player-shortcuts>
        <button type="button" disabled={session.groupIndex === 0} onClick={() => send({ type: "previous" })}>이전<kbd>←</kbd></button>
        <button type="button" className="dock-play" aria-label="재생 또는 일시정지" onClick={() => send({ type: active ? "pause" : "space" })}>{active ? <PauseIcon /> : <PlayIcon />}</button>
        <button type="button" disabled={session.completedCycles < 3} onClick={() => send({ type: "next" })}>다음<kbd>→</kbd></button>
      </nav> : null}
    </Page>
  );
}
