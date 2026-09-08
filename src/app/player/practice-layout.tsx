"use client";

import { type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { LessonSection } from "@/lib/lesson-section";
import { cn } from "@/lib/utils";
import { CheckIcon, LessonIcon, MenuIcon } from "../ui";
import { PracticeHelp } from "./practice-help";
import { useAudioProgress } from "./use-audio-progress";
import styles from "./practice.module.css";

export function PracticeHeader({ children, menuOpen, onMenu }: {
  children: ReactNode; menuOpen: boolean; onMenu: () => void;
}) {
  return <header className={styles.header}>
    <nav className={styles.topbar} aria-label="학습 탐색">
      <Button type="button" variant="context" size="icon" id="player-menu-trigger" aria-label="학습 메뉴" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="player-menu" onClick={onMenu}><MenuIcon /></Button>
      {children}
    </nav>
  </header>;
}

export function PracticeProgress({ index, count, progress, progressLabel, unitLabel }: {
  index: number; count: number; progress: number; progressLabel: string; unitLabel?: string;
}) {
  return <div className={styles.progressRow}>
      <Progress variant="lesson" shimmer className={styles.progress} aria-label={progressLabel} value={progress} max={count} />
      <span>{unitLabel}{index + 1}<span className={styles.progressTotal}> / {count}</span></span>
    </div>;
}

export function PracticeFooter({ children, utilities, cycles, actionsHidden = false }: { children: ReactNode; utilities?: ReactNode; cycles?: ReactNode; actionsHidden?: boolean }) {
  return <footer className={styles.footer} aria-label="학습 컨트롤">
    {utilities ? <div className={styles.footerTools} data-player-shortcuts>{utilities}</div> : null}
    {cycles ? <div className={styles.listeningControls}>{cycles}</div> : null}
    <div className={styles.actions} role="group" aria-label="학습 진행" data-hidden={actionsHidden} data-player-shortcuts>{children}</div>
  </footer>;
}

export function CycleProgress({ completed, target, audioRef, attempt = 0 }: { completed: number; target: 3 | 5; audioRef: RefObject<HTMLAudioElement | null>; attempt?: number }) {
  const progress = useAudioProgress(audioRef, attempt);
  return <div className={styles.cycles} role="group" aria-label="완료한 듣기">
    <span className={styles.cycleDots} data-expanded={target === 5}>
      {Array.from({ length: 5 }, (_, index) => <span className={styles.cycleStep} key={index} data-visible={index < target} data-complete={index < target ? completed > index : undefined}
        data-current={index < target && index === completed ? true : undefined}>
        <i>{completed > index ? <CheckIcon aria-hidden="true" /> : index < target && index === completed ?
          <svg className={styles.cycleRing} viewBox="0 0 28 28" role="progressbar" aria-label="원음 재생 진행"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}
            aria-valuetext={progress === null ? "재생 길이 확인 중" : undefined}>
            <circle cx="14" cy="14" r="12.5" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (progress ?? 0)} />
          </svg> : null}</i>
      </span>)}
    </span>
    <span className={styles.screenReaderOnly} aria-live="polite" aria-atomic="true">필수 {Math.min(3, completed)} / 3{target === 5 ? ` · 추가 ${Math.max(0, completed - 3)} / 2` : ""}</span>
  </div>;
}

export function PracticeContext({ level, sessionLabel, helpOpen, settingsOpen, onHelp, onCloseHelp, onSettings, analysisAction }: {
  level: number; sessionLabel: string;
  helpOpen: boolean; settingsOpen: boolean; onHelp: () => void; onCloseHelp: () => void; onSettings: () => void;
  analysisAction: ReactNode;
}) {
  return <header className={styles.lessonContext} aria-label="레슨 안내">
    <div className={styles.contextInner}>
    <div className={styles.contextRow}>
      <h1 id="player-title" className={styles.contextLevel}>
        <PracticeHelp level={level} open={helpOpen} onOpen={onHelp} onClose={onCloseHelp}>
          <Button type="button" variant="context" size="row" id="practice-help-trigger" className={cn(styles.contextSegment, styles.stageTrigger)} data-selected={helpOpen}
            aria-haspopup="dialog" aria-expanded={helpOpen} aria-controls="practice-help">메타쉐도잉 레벨 {level}</Button>
        </PracticeHelp>
      </h1>
    <Button type="button" variant="context" size="row" id="player-settings-trigger" className={cn(styles.contextSegment, styles.sessionShortcut)} data-selected={settingsOpen} aria-label={`재생 모드 및 속도: ${sessionLabel}`}
      aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="player-menu" onClick={onSettings}>{sessionLabel}</Button>
      {analysisAction}
    </div>
    </div>
  </header>;
}

export function PracticeSection({ chapter, startsSection }: LessonSection) {
  if (!chapter && !startsSection) return null;
  return <div className={styles.chapter} aria-label="현재 챕터">
    {startsSection ? <Separator className={styles.sectionDivider} decorative={false} aria-label="구간 경계" /> : null}
    {chapter ? <div className={styles.chapterHeading}>
      {chapter ? <><LessonIcon />
      <div className={styles.chapterTitle}>
        <h2>{chapter.target}</h2>
        {chapter.korean !== chapter.target ? <p lang="ko">{chapter.korean}</p> : null}
      </div></> : null}
      <Separator className={styles.chapterRule} />
    </div> : null}
  </div>;
}
