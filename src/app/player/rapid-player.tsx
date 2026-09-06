"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lesson } from "@/lib/lessons";
import { isRapidRunning, rapidDisplay, RAPID_WPM, type RapidLevel, type RapidLine, type RapidSettings } from "@/lib/rapid-session";
import { BackIcon, Brand, GearIcon, Page, PauseIcon, PlayIcon } from "../ui";
import { RapidSessionControls } from "../rapid-session-controls";
import { useRapidSession } from "./use-rapid-session";
import type { LearningStart } from "./use-learning-record";
import { CompletionSummary } from "../completion-summary";

export function RapidPlayer({ lesson, lines, level, settings, start }: { lesson: Lesson; lines: RapidLine[]; level: RapidLevel; settings: RapidSettings; start: LearningStart }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { session, send, completion, storageFailed } = useRapidSession(lesson, lines, level, settings, !settingsOpen, start);
  const display = rapidDisplay(session);
  const singleToken = display && (session.settings.display === "current" || display.position === 1);
  const line = lines[session.lineIndex];
  const complete = session.phase === "completed";
  const running = isRapidRunning(session);
  const lineFinished = session.phase === "line-complete" || session.phase === "gap" || complete;
  const progress = session.lineIndex + (lineFinished ? 1 : 0);
  const actionLabel = running ? "일시정지" : session.paused ? "계속 재생" : session.phase === "line-complete" ? "다음 문장" : "문장 시작";
  const status = session.paused ? "일시정지됨"
    : session.phase === "target" ? "나타나는 목표어를 따라 말해 보세요."
    : session.phase === "korean" ? (level === 6 ? "한국어 뜻을 확인하세요." : "한국어를 보고 목표어 문장을 떠올려 보세요.")
    : session.phase === "speaking" ? "목표어 문장을 말해 보세요."
    : session.phase === "gap" ? "곧 다음 문장으로 이동합니다."
    : session.phase === "line-complete" ? "한 문장을 마쳤어요. 다음 문장을 시작하세요."
    : "준비되면 문장을 시작하세요. 음성은 재생되지 않습니다.";
  const placeholder = session.phase === "speaking" ? "말해 보세요" : session.phase === "gap" ? "잠시 쉬어 가세요" : session.phase === "line-complete" ? "한 문장 완료" : "준비되셨나요?";

  return <Page className="player-page audio-phrase-player rapid-player">
    <header className="player-topbar">
      <button type="button" aria-label="레슨으로 돌아가기" className="icon-button" onClick={() => router.push("/home")}><BackIcon /></button>
      <Brand />
      <button type="button" aria-label="학습 설정" aria-expanded={settingsOpen} aria-controls="rapid-settings" className="icon-button" onClick={() => {
        if (!settingsOpen) send({ type: "pause" });
        setSettingsOpen(!settingsOpen);
      }}><GearIcon /></button>
    </header>
    <div className="player-progress">
      <span>문장 {session.lineIndex + 1} / {lines.length}</span>
      <div role="progressbar" aria-label="문장 진행" aria-valuemin={0} aria-valuemax={lines.length} aria-valuenow={progress}><i style={{ width: `${progress / lines.length * 100}%` }} /></div>
    </div>
    {line?.chapter || line?.boundary === "section" ? <header className="chapter-header" aria-label="현재 챕터">
      {line.chapter ? <><strong>{line.chapter.target}</strong><span>{line.chapter.korean}</span></> : null}
      {line.boundary === "section" ? <hr className="section-divider" aria-label="구간 경계" /> : null}
    </header> : null}
    <section className="practice-shell" aria-labelledby="player-title">
      <h1 id="player-title">메타쉐도잉 레벨 {level}</h1>
      {settingsOpen ? <section id="rapid-settings" className="player-settings" aria-label="학습 설정">
        <h2>세션 설정</h2>
        <RapidSessionControls level={level} settings={session.settings} onChange={settings => send({ type: "settings", settings })} />
        <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>설정 닫기</button>
      </section> : completion ? <CompletionSummary record={completion} storageFailed={storageFailed} onHome={() => router.push("/home")} /> : <>
        <p className="rapid-stage">{display ? `${display.language === "korean" ? "한국어" : lesson.language === "english" ? "영어" : "일본어"} · ${display.position} / ${display.count}` : session.phase === "speaking" ? "말하기 시간" : "속사포 연습"}</p>
        <div role="region" aria-label="속사포 학습" className={`practice-canvas rapid-canvas ${singleToken ? "single-token" : "cumulative"}`}>
          {display ? <span lang={display.language === "korean" ? "ko" : lesson.language === "english" ? "en" : "ja"}>{display.text}</span> : <p>{placeholder}</p>}
        </div>
        <div className="session-meta">
          <p className="session-mode">{session.settings.mode === "automatic" ? "자동" : "수동"} · {RAPID_WPM[session.settings.wpmLevel]} WPM</p>
          {session.phase === "speaking" || session.phase === "gap" ? <p className="session-timer" role="timer" aria-label="남은 시간">{(session.remainingMs / 1000).toFixed(1)}초</p> : null}
        </div>
        <p className="session-status" role="status">{status}</p>
        <div className="player-actions" data-player-shortcuts>
          <button type="button" onClick={() => send({ type: "restart" })}>다시 하기<kbd>R</kbd></button>
          <button type="button" className="continue" aria-label={actionLabel} onClick={() => send({ type: "space" })}>{actionLabel}<kbd>Space</kbd></button>
        </div>
      </>}
    </section>
    {!complete && !settingsOpen ? <nav className="playback-dock" aria-label="재생 제어" data-player-shortcuts>
      <button type="button" disabled={session.lineIndex === 0} onClick={() => send({ type: "previous" })}>이전<kbd>←</kbd></button>
      <button type="button" className="dock-play" aria-label="재생 또는 일시정지" onClick={() => send({ type: "space" })}>{running ? <PauseIcon /> : <PlayIcon />}</button>
      <button type="button" disabled={session.lineIndex === lines.length - 1} onClick={() => send({ type: "next" })}>다음<kbd>→</kbd></button>
    </nav> : null}
  </Page>;
}
