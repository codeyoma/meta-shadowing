"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSessionTimer, type AudioPracticeLevel, type AudioSessionSettings } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import type { PhraseGroup } from "@/lib/phrase-groups";
import { lessonSectionAt } from "@/lib/lesson-section";
import { AudioSessionControls } from "../audio-session-controls";
import { Page, PauseIcon, PlayIcon, RepeatIcon, SubtitleIcon } from "../ui";
import { useAudioSession } from "./use-audio-session";
import type { LearningStart } from "./use-learning-record";
import { CompletionSummary } from "../completion-summary";
import { ScreenWake } from "./screen-wake";
import { CycleProgress, PracticeContext, PracticeFooter, PracticeHeader, PracticeProgress, PracticeSection } from "./practice-layout";
import { AudioPlaybackButton } from "./audio-playback-button";
import { PracticeSubtitles } from "./practice-subtitles";
import { PlayerSettings } from "./player-settings";
import { SentenceMenu } from "./sentence-menu";
import styles from "./practice.module.css";

export function AudioPhrasePlayer({ lesson, level, settings, hints, groups, start, notice }: { lesson: PublishedLesson; level: AudioPracticeLevel; settings: AudioSessionSettings; hints: SubtitleHint[]; groups: PhraseGroup[]; start: LearningStart; notice?: ReactNode }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { session, send, audioRef, completion, storageFailed } = useAudioSession(lesson, level, settings, groups, !settingsOpen && !menuOpen, start);
  const canvasRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLLIElement>(null);
  const grouped = level === 4 || level === 5;
  const group = groups[session.groupIndex];
  const hintLevel = level === 3 || level === 5;
  const phrase = lesson.phrases[session.phraseIndex];
  const sectionPhraseNumber = grouped ? group.phrases[0].phraseNumber : phrase.phraseNumber;
  const section = useMemo(() => lessonSectionAt(lesson.entries, sectionPhraseNumber), [lesson.entries, sectionPhraseNumber]);
  const hintOnly = hintLevel && !session.subtitlesRevealed;
  const subtitle = hintOnly ? hints[session.phraseIndex] : phrase;
  const complete = session.phase === "completed";
  const active = ["loading", "playing", "gap", "speaking", "countdown"].includes(session.phase)
    || (session.phase === "ready" && session.completedCycles > 0);
  const playing = ["loading", "playing", "gap"].includes(session.phase);
  const audioPaused = session.phase === "paused" && ["loading", "playing", "gap"].includes(session.pausedPhase);
  const highlightPhrase = playing || audioPaused;
  const timed = hasSessionTimer(session);
  const nextLabel = grouped ? "다음 묶음" : "다음 프레이즈";
  const actionLabel = playing ? "일시정지" : session.phase === "paused" ? "계속 재생"
    : session.phase === "error" ? "다시 시도" : session.completedCycles >= session.cycleTarget ? nextLabel
    : session.completedCycles === 0 ? "첫 원음 듣기" : "다음 원음 듣기";
  const choosing = session.completedCycles >= session.cycleTarget && session.phase === "ready";
  const actionText = playing ? "PAUSE" : session.phase === "error" ? "RETRY" : "CONTINUE";
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
    <Page className={styles.player}>
      <PracticeHeader sessionLabel={`${session.mode === "automatic" ? "자동" : "수동"} · ${session.playbackRate}×`} settingsOpen={settingsOpen} settingsId="player-settings" menuOpen={menuOpen} onMenu={() => {
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
        <PracticeProgress index={progressIndex} count={progressCount} progress={progress} progressLabel={grouped ? "묶음 진행" : "프레이즈 진행"} unitLabel={grouped ? "묶음 " : undefined} />
      </PracticeContext>
      {!complete ? <CycleProgress completed={session.completedCycles} target={session.cycleTarget} /> : null}
      <section className={styles.practice} aria-labelledby="player-title" aria-describedby="practice-instruction">
        <audio ref={audioRef} preload="auto" />
        {completion ? <CompletionSummary record={completion} storageFailed={storageFailed} onHome={() => router.push("/home")} /> : (
          <>
            <PracticeSection {...section} />
            <PracticeSubtitles
              lines={grouped ? group.phrases.map(line => hintOnly ? hints[line.phraseNumber - 1] : line) : [subtitle]}
              language={lesson.language} grouped={grouped} currentIndex={grouped ? group.phrases.findIndex(line => line.phraseNumber === phrase.phraseNumber) : 0}
              highlight={highlightPhrase} canvasRef={canvasRef} currentLineRef={currentLineRef}
              playback={<AudioPlaybackButton audioRef={audioRef} playing={playing} disabled={session.completedCycles >= 5} onClick={() => send({ type: !playing && !audioPaused && session.completedCycles >= 3 ? "retry" : "space" })} />}
            />
            {grouped || timed ? <div className={styles.meta}>
              {grouped ? <p>{group.phrases.length}문장</p> : null}
              {timed ? <p className={styles.timer} role="timer" aria-label="남은 시간">{(session.remainingMs / 1000).toFixed(1)}초</p> : null}
            </div> : null}
            {session.phase === "error" ? (
              <div className={styles.error} role="alert" aria-label="원음 재생 오류"><p>원음을 재생할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.</p><button type="button" className="secondary-button" onClick={() => send({ type: "retry" })}>다시 시도</button></div>
            ) : null}
          </>
        )}
      </section>
      <ScreenWake active={active && !settingsOpen && !menuOpen && !complete} />
      </div>
      {!complete ? <PracticeFooter utilities={hintLevel ? <button type="button" className={styles.tool} aria-label="자막 보기" aria-expanded={session.subtitlesRevealed} aria-controls="practice-subtitles" onClick={() => send({ type: "reveal-subtitles" })}><SubtitleIcon />자막 보기<kbd>S</kbd></button> : undefined}>
        {choosing ? <>
          {session.cycleTarget === 3 ? <button type="button" className={styles.action} aria-label="REPEAT · 다시 듣기" title="2회 더 연습" onClick={() => send({ type: "retry" })}><RepeatIcon />REPEAT<kbd>R</kbd></button> : null}
          <button type="button" className={`${styles.action} ${styles.primary}`} aria-label={`NEXT · ${nextLabel}`} onClick={() => send({ type: "next" })}><PlayIcon />NEXT<kbd>Space</kbd></button>
        </> : <button type="button" className={`${styles.action} ${styles.primary}`} aria-label={`${actionText} · ${actionLabel}`} onClick={() => send({ type: "space" })}>{playing ? <PauseIcon /> : <PlayIcon />}{actionText}<kbd>Space</kbd></button>}
      </PracticeFooter> : null}
      {settingsOpen ? <PlayerSettings id="player-settings" onClose={() => setSettingsOpen(false)}>
        <AudioSessionControls level={level} settings={session} onChange={value => send({ type: "settings", ...value })} />
      </PlayerSettings> : null}
      {menuOpen ? <SentenceMenu lesson={lesson} grouped={grouped} currentPhraseNumbers={grouped ? group.phrases.map(line => line.phraseNumber) : [phrase.phraseNumber]}
        onSelect={phraseIndex => send({ type: "jump", phraseIndex })} onClose={() => setMenuOpen(false)} onHome={() => router.push("/home")} /> : null}
    </Page>
  );
}
