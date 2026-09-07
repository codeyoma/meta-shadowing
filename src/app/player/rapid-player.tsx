"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { PublishedLesson } from "@/lib/lessons";
import { isRapidRunning, rapidDisplay, RAPID_WPM, type RapidLevel, type RapidLine, type RapidSettings } from "@/lib/rapid-session";
import { Page, PauseIcon, PlayIcon } from "../ui";
import { RapidSessionControls } from "../rapid-session-controls";
import { useRapidSession } from "./use-rapid-session";
import type { LearningStart } from "./use-learning-record";
import { CompletionSummary } from "../completion-summary";
import { ScreenWake } from "./screen-wake";
import { PracticeContext, PracticeFooter, PracticeHeader, PracticeProgress, PracticeSection } from "./practice-layout";
import { SentenceMenu } from "./sentence-menu";
import { PlayerSettings } from "./player-settings";
import styles from "./practice.module.css";

export function RapidPlayer({ lesson, lines, level, settings, start, notice }: { lesson: PublishedLesson; lines: RapidLine[]; level: RapidLevel; settings: RapidSettings; start: LearningStart; notice?: ReactNode }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { session, send, completion, storageFailed } = useRapidSession(lesson, lines, level, settings, !settingsOpen && !menuOpen, start);
  const display = rapidDisplay(session);
  const line = lines[session.lineIndex];
  const complete = session.phase === "completed";
  const running = isRapidRunning(session);
  const lineFinished = session.phase === "line-complete" || session.phase === "gap" || complete;
  const progress = session.lineIndex + (lineFinished ? 1 : 0);
  const actionLabel = running ? "일시정지" : session.paused ? "계속 재생" : session.phase === "line-complete" ? "다음 문장" : "문장 시작";
  const placeholder = session.phase === "speaking" ? "말해 보세요" : session.phase === "gap" ? "잠시 쉬어 가세요" : session.phase === "line-complete" ? "한 문장 완료" : "준비되셨나요?";

  return <Page className={styles.player}>
    <PracticeHeader sessionLabel={`${session.settings.mode === "automatic" ? "자동" : "수동"} · ${RAPID_WPM[session.settings.wpmLevel]} WPM`} settingsOpen={settingsOpen} settingsId="rapid-settings" menuOpen={menuOpen} onMenu={() => {
        send({ type: "pause" });
        setSettingsOpen(false);
        setMenuOpen(true);
      }} onSettings={() => {
        if (!settingsOpen) send({ type: "pause" });
        setSettingsOpen(!settingsOpen);
      }} />
    <div className={styles.content}>
    {notice}
    <PracticeContext name={lesson.name} localizedName={lesson.localizedName} level={level}>
      <PracticeProgress index={session.lineIndex} count={lines.length} progress={progress} progressLabel="문장 진행" unitLabel="문장 " />
    </PracticeContext>
    <section className={styles.practice} aria-labelledby="player-title" aria-describedby="practice-instruction">
      {completion ? <CompletionSummary record={completion} storageFailed={storageFailed} onHome={() => router.push("/home")} /> : <>
        <PracticeSection chapter={line?.chapter ?? null} startsSection={line?.boundary === "section"} />
        <div className={`${styles.bubble} ${styles.textOnly}`}>
        <div role="region" aria-label="속사포 학습" tabIndex={0} className={styles.canvas}>
          {display ? <span lang={display.language === "korean" ? "ko" : lesson.language === "english" ? "en" : "ja"}>{display.text}</span> : <p>{placeholder}</p>}
        </div>
        </div>
        <p className={styles.stage}>{display ? `${display.language === "korean" ? "한국어" : lesson.language === "english" ? "영어" : "일본어"} · ${display.position} / ${display.count}` : session.phase === "speaking" ? "말하기 시간" : "속사포 연습"}</p>
        {session.phase === "speaking" || session.phase === "gap" ? <div className={styles.meta}>
          <p className={styles.timer} role="timer" aria-label="남은 시간">{(session.remainingMs / 1000).toFixed(1)}초</p>
        </div> : null}
      </>}
    </section>
    <ScreenWake active={running && !settingsOpen && !menuOpen && !complete} />
    </div>
    {!complete ? <PracticeFooter>
      <button type="button" className={`${styles.action} ${styles.primary}`} aria-label={`${running ? "PAUSE" : "CONTINUE"} · ${actionLabel}`} onClick={() => send({ type: "space" })}>{running ? <PauseIcon /> : <PlayIcon />}{running ? "PAUSE" : "CONTINUE"}<kbd>Space</kbd></button>
    </PracticeFooter> : null}
    {settingsOpen ? <PlayerSettings id="rapid-settings" onClose={() => setSettingsOpen(false)}>
      <RapidSessionControls level={level} settings={session.settings} onChange={settings => send({ type: "settings", settings })} />
    </PlayerSettings> : null}
    {menuOpen ? <SentenceMenu lesson={lesson} currentPhraseNumbers={[session.lineIndex + 1]}
      onSelect={lineIndex => send({ type: "jump", lineIndex })} onClose={() => setMenuOpen(false)} onHome={() => router.push("/home")} /> : null}
  </Page>;
}
