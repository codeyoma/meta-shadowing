"use client";

import { useState, type ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { browseHref, stageHref } from "@/lib/browse-navigation";
import { languageCode, languageInfo } from "@/lib/languages";
import type { PublishedLesson } from "@/lib/lessons";
import { isRapidRunning, rapidDisplay, RAPID_WPM, type RapidLevel, type RapidLine, type RapidSettings } from "@/lib/rapid-session";
import { Page, PauseIcon, PlayIcon } from "../ui";
import { RapidSessionControls } from "../rapid-session-controls";
import { useRapidSession } from "./use-rapid-session";
import type { LearningStart, CloudRecording } from "./recording-types";
import { CompletionSummary } from "../completion-summary";
import { ScreenWake } from "./screen-wake";
import { PracticeContext, PracticeFooter, PracticeHeader, PracticeProgress, PracticeSection } from "./practice-layout";
import { PlayerDrawer, type DrawerView } from "./player-drawer";
import { DictionaryPopup, useDictionaryPopup } from "./dictionary-popup";
import { DictionaryWords, type DictionaryWordSelect } from "./dictionary-words";
import { SentenceAnalysisButton, SentenceAnalysisPopup, useSentenceAnalysis } from "./sentence-analysis-popup";
import styles from "./practice.module.css";

export function RapidPlayer({ lesson, lines, level, settings, start, notice, cloud }: { lesson: PublishedLesson; lines: RapidLine[]; level: RapidLevel; settings: RapidSettings; start: LearningStart; notice?: ReactNode; cloud: CloudRecording }) {
  const [surface, setSurface] = useState<"menu" | "settings" | "help" | null>(null);
  const [drawerView, setDrawerView] = useState<DrawerView>("menu");
  const menuOpen = surface === "menu" || surface === "settings";
  const dictionary = useDictionaryPopup();
  const analysis = useSentenceAnalysis();
  const { session, send, completion } = useRapidSession(lesson, lines, level, settings, surface === null && !dictionary.open && !analysis.open, start, cloud);
  const navigate = (href: string) => cloud.exit(href);
  const openDictionary: DictionaryWordSelect = (word, trigger) => {
    send({ type: "pause" });
    dictionary.openWord(word, trigger);
  };
  function openSurface(view: "menu" | "settings" | "help") {
    send({ type: "pause" });
    if (view !== "help") setDrawerView(view);
    setSurface(view);
  }
  const display = rapidDisplay(session);
  const line = lines[session.lineIndex];
  const complete = session.phase === "completed";
  const running = isRapidRunning(session);
  const lineFinished = session.phase === "line-complete" || session.phase === "gap" || complete;
  const progress = session.lineIndex + (lineFinished ? 1 : 0);
  const actionLabel = running ? "일시정지" : session.paused ? "계속 재생" : session.phase === "line-complete" ? "다음 문장" : "문장 시작";
  const placeholder = session.phase === "speaking" ? "말해 보세요" : session.phase === "gap" ? "잠시 쉬어 가세요" : session.phase === "line-complete" ? "한 문장 완료" : "준비되셨나요?";

  return <Page className={styles.player}>
    <PracticeHeader menuOpen={menuOpen} onMenu={() => openSurface("menu")}>
      <PracticeProgress index={session.lineIndex} count={lines.length} progress={progress} progressLabel="문장 진행" unitLabel="문장 " />
    </PracticeHeader>
    <div className={styles.content}>
    {notice}
    <PracticeContext level={level}
      sessionLabel={`${session.settings.mode === "automatic" ? "자동" : "수동"} · ${RAPID_WPM[session.settings.wpmLevel]} WPM`}
      helpOpen={surface === "help"} settingsOpen={menuOpen && drawerView === "settings"} onHelp={() => openSurface("help")}
      onCloseHelp={() => setSurface(null)} onSettings={() => openSurface("settings")}
      analysisAction={<SentenceAnalysisButton disabled={complete} onClick={trigger => {
        send({ type: "pause" });
        analysis.show(lesson.phrases[session.lineIndex].phraseNumber, trigger);
      }} />} />
    <section className={styles.practice} aria-labelledby="player-title">
      {completion ? <CompletionSummary record={completion} onHome={() => navigate(browseHref("lessons", { language: lesson.language, lessonId: lesson.id }))} /> : <>
        <PracticeSection chapter={line?.chapter ?? null} startsSection={line?.boundary === "section"} />
        <Bubble variant="outline" className={cn(styles.bubble, styles.textOnly)}>
        <BubbleContent size="lg" className={styles.bubbleFrame}>
        <div role="region" aria-label="속사포 학습" tabIndex={0} className={styles.canvas}>
          {display ? <span lang={display.language === "korean" ? "ko" : languageCode(lesson.language)}>{display.language === "korean" ? display.text : <DictionaryWords text={display.text} language={lesson.language} onWordSelect={openDictionary} />}</span> : <p>{placeholder}</p>}
        </div>
        </BubbleContent>
        </Bubble>
        <p className={styles.stage}>{display ? `${display.language === "korean" ? "한국어" : languageInfo(lesson.language).koreanLabel} · ${display.position} / ${display.count}` : session.phase === "speaking" ? "말하기 시간" : "속사포 연습"}</p>
        {session.phase === "speaking" || session.phase === "gap" ? <div className={styles.meta}>
          <p className={styles.timer} role="timer" aria-label="남은 시간">{(session.remainingMs / 1000).toFixed(1)}초</p>
        </div> : null}
      </>}
    </section>
    <ScreenWake active={running && surface === null && !dictionary.open && !analysis.open && !complete} />
    </div>
    {!complete ? <PracticeFooter actionsHidden={dictionary.open || analysis.open || surface === "help"}>
      <Button disabled={cloud?.blocked} type="button" variant="practice" size="lg" className={styles.action} aria-label={`${running ? "PAUSE" : "CONTINUE"} · ${actionLabel}`} onClick={() => send({ type: "space" })}>{running ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}{running ? "PAUSE" : "CONTINUE"}<Kbd>Space</Kbd></Button>
    </PracticeFooter> : null}
    <PlayerDrawer open={menuOpen} lesson={lesson} currentPhraseNumbers={[session.lineIndex + 1]}
      initialView={surface === "settings" ? "settings" : "menu"} onViewChange={setDrawerView}
      settings={<>
        {cloud ? <p>이 설정은 현재 학습에만 적용됩니다. 계정 기본 설정은 새 학습부터 적용됩니다.</p> : null}
        <RapidSessionControls disabled={complete || cloud.blocked} level={level} settings={session.settings} onChange={settings => send({ type: "settings", settings })} />
      </>}
      onSelect={lineIndex => send({ type: "jump", lineIndex })} onClose={() => setSurface(null)} onStages={() => navigate(stageHref(lesson.id, start.selection.stage))} />
    {dictionary.selection ? <DictionaryPopup selection={dictionary.selection} language={lesson.language} onClose={dictionary.close} /> : null}
    {analysis.selection ? <SentenceAnalysisPopup lesson={lesson} selection={analysis.selection} onClose={analysis.close} /> : null}
  </Page>;
}
