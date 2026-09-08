"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { hasSessionTimer, isAudioRepeatAvailable, type AudioPracticeLevel, type AudioSessionSettings } from "@/lib/audio-session";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import type { PhraseGroup } from "@/lib/phrase-groups";
import { lessonSectionAt } from "@/lib/lesson-section";
import { browseHref, stageHref } from "@/lib/browse-navigation";
import { AudioSessionControls } from "../audio-session-controls";
import { Page, PauseIcon, PlayIcon, RepeatIcon, SubtitleIcon } from "../ui";
import { useAudioSession } from "./use-audio-session";
import type { LearningStart, CloudRecording } from "./use-learning-record";
import { CompletionSummary } from "../completion-summary";
import { ScreenWake } from "./screen-wake";
import { CycleProgress, PracticeContext, PracticeFooter, PracticeHeader, PracticeProgress, PracticeSection } from "./practice-layout";
import { PracticeSubtitles } from "./practice-subtitles";
import { DictionaryPopup, useDictionaryPopup } from "./dictionary-popup";
import type { DictionaryWordSelect } from "./dictionary-words";
import { SentenceAnalysisButton, SentenceAnalysisPopup, useSentenceAnalysis } from "./sentence-analysis-popup";
import { PlayerDrawer, type DrawerView } from "./player-drawer";
import styles from "./practice.module.css";

export function AudioPhrasePlayer({ lesson, level, settings, hints, groups, start, notice, cloud }: { lesson: PublishedLesson; level: AudioPracticeLevel; settings: AudioSessionSettings; hints: SubtitleHint[]; groups: PhraseGroup[]; start: LearningStart; notice?: ReactNode; cloud?: CloudRecording }) {
  const router = useRouter();
  const [surface, setSurface] = useState<"menu" | "settings" | "help" | null>(null);
  const [drawerView, setDrawerView] = useState<DrawerView>("menu");
  const menuOpen = surface === "menu" || surface === "settings";
  const dictionary = useDictionaryPopup();
  const analysis = useSentenceAnalysis();
  const { session, send, audioRef, completion, storageFailed } = useAudioSession(lesson, level, settings, groups, surface === null && !dictionary.open && !analysis.open, start, cloud);
  const navigate = (href: string) => cloud ? cloud.exit(href) : router.push(href);
  const openDictionary: DictionaryWordSelect = (word, trigger) => {
    send({ type: "pause" });
    dictionary.openWord(word, trigger);
  };
  function openSurface(view: "menu" | "settings" | "help") {
    send({ type: "pause" });
    if (view !== "help") setDrawerView(view);
    setSurface(view);
  }
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
  const pendingConfirmation = session.mode === "manual" && session.completedCycles > session.confirmedCycles
    && (session.phase === "ready" || (session.phase === "paused" && session.pausedPhase === "ready"));
  const actionLabel = playing ? "일시정지" : pendingConfirmation ? "듣기 완료 확인" : session.phase === "paused" ? "계속 재생"
    : session.phase === "error" ? "다시 시도" : session.confirmedCycles >= session.cycleTarget ? nextLabel
    : session.completedCycles === 0 ? "첫 원음 듣기" : "다음 원음 듣기";
  const choosing = session.confirmedCycles >= session.cycleTarget
    && (session.phase === "ready" || (session.phase === "paused" && session.pausedPhase === "ready"));
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
      <PracticeHeader menuOpen={menuOpen} onMenu={() => openSurface("menu")}>
        <PracticeProgress index={progressIndex} count={progressCount} progress={progress} progressLabel={grouped ? "묶음 진행" : "프레이즈 진행"} unitLabel={grouped ? "묶음 " : undefined} />
      </PracticeHeader>
      <div className={styles.content}>
      {notice}
      <PracticeContext level={level}
        sessionLabel={`${session.mode === "automatic" ? "자동" : "수동"} · ${session.playbackRate}×`}
        helpOpen={surface === "help"} settingsOpen={menuOpen && drawerView === "settings"} onHelp={() => openSurface("help")}
        onCloseHelp={() => setSurface(null)} onSettings={() => openSurface("settings")}
        analysisAction={<SentenceAnalysisButton disabled={hintOnly || complete} onClick={trigger => {
          send({ type: "pause" });
          analysis.show(phrase.phraseNumber, trigger);
        }} />} />
      <section className={styles.practice} aria-labelledby="player-title">
        <audio ref={audioRef} preload="auto" />
        {completion ? <CompletionSummary record={completion} storageFailed={storageFailed} onHome={() => navigate(browseHref("lessons", { language: lesson.language, lessonId: lesson.id }))} /> : (
          <>
            <PracticeSection {...section} />
            <PracticeSubtitles
              lines={grouped ? group.phrases.map(line => hintOnly ? hints[line.phraseNumber - 1] : line) : [subtitle]}
              language={lesson.language} grouped={grouped} currentIndex={grouped ? group.phrases.findIndex(line => line.phraseNumber === phrase.phraseNumber) : 0}
              highlight={highlightPhrase} canvasRef={canvasRef} currentLineRef={currentLineRef}
              onWordSelect={openDictionary}
            />
            {grouped || timed ? <div className={styles.meta}>
              {grouped ? <p>{group.phrases.length}문장</p> : null}
              {timed ? <p className={styles.timer} role="timer" aria-label="남은 시간">{(session.remainingMs / 1000).toFixed(1)}초</p> : null}
            </div> : null}
          </>
        )}
      </section>
      <ScreenWake active={active && surface === null && !dictionary.open && !analysis.open && !complete} />
      </div>
      {!complete ? <PracticeFooter
        actionsHidden={dictionary.open || analysis.open || surface === "help"}
        cycles={<CycleProgress completed={session.confirmedCycles} target={session.cycleTarget} audioRef={audioRef} attempt={session.attempt} />} utilities={hintLevel ? <Button type="button" variant="ghost" size="sm" aria-label="자막 보기" aria-expanded={session.subtitlesRevealed} aria-controls="practice-subtitles" onClick={() => send({ type: "reveal-subtitles" })}><SubtitleIcon data-icon="inline-start" />자막 보기<Kbd>S</Kbd></Button> : undefined}>
        {choosing ? <>
          {isAudioRepeatAvailable(session) ? <Button disabled={cloud?.blocked} type="button" variant="outline" size="lg" className={styles.action} aria-label="REPEAT · 다시 듣기" title="2회 더 연습" onClick={() => send({ type: "retry" })}><RepeatIcon data-icon="inline-start" />REPEAT<Kbd>R</Kbd></Button> : null}
          <Button disabled={cloud?.blocked} type="button" variant="practice" size="lg" className={styles.action} aria-label={`NEXT · ${nextLabel}`} onClick={() => send({ type: "next" })}><PlayIcon data-icon="inline-start" />NEXT<Kbd>Space</Kbd></Button>
        </> : <Button disabled={cloud?.blocked} type="button" variant="practice" size="lg" className={styles.action} aria-label={`${actionText} · ${actionLabel}`} onClick={() => send({ type: "space" })}>{playing ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}{actionText}<Kbd>Space</Kbd></Button>}
      </PracticeFooter> : null}
      <PlayerDrawer open={menuOpen} lesson={lesson} currentPhraseNumbers={grouped ? group.phrases.map(line => line.phraseNumber) : [phrase.phraseNumber]}
        initialView={surface === "settings" ? "settings" : "menu"} onViewChange={setDrawerView}
        settings={cloud ? <p>이번 학습은 시작 당시의 계정 설정을 사용합니다. 설정 변경은 다음 학습부터 적용됩니다. 현재 클라우드는 수동 프레이즈 학습만 지원합니다.</p> : <AudioSessionControls level={level} settings={session} onChange={value => send({ type: "settings", ...value })} />}
        onSelect={phraseIndex => send({ type: "jump", phraseIndex })} onClose={() => setSurface(null)} onStages={() => navigate(stageHref(lesson.id, start.selection.stage))} />
      {dictionary.selection ? <DictionaryPopup selection={dictionary.selection} language={lesson.language} onClose={dictionary.close} /> : null}
      {analysis.selection ? <SentenceAnalysisPopup lesson={lesson} selection={analysis.selection} onClose={analysis.close} /> : null}
    </Page>
  );
}
