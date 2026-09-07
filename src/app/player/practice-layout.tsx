import type { ReactNode } from "react";
import type { LessonSection } from "@/lib/lesson-section";
import { Brand, GearIcon, LessonIcon, MenuIcon } from "../ui";
import styles from "./practice.module.css";

export function PracticeHeader({ sessionLabel, settingsOpen, settingsId, menuOpen, onMenu, onSettings }: {
  sessionLabel: string;
  settingsOpen: boolean; settingsId: string; menuOpen: boolean; onMenu: () => void; onSettings: () => void;
}) {
  return <header className={styles.header}>
    <div className={styles.topbar}>
      <button type="button" id="sentence-menu-trigger" aria-label="문장 목록" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="sentence-menu" className={styles.iconButton} onClick={onMenu}><MenuIcon /></button>
      <Brand compact />
      <div className={styles.headerControls}>
        <span className={styles.sessionLabel} aria-label="재생 모드 및 속도">{sessionLabel}</span>
        <button type="button" id={`${settingsId}-trigger`} aria-label="학습 설정" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls={settingsId} className={styles.iconButton} onClick={onSettings}><GearIcon /></button>
      </div>
    </div>
  </header>;
}

export function PracticeProgress({ index, count, progress, progressLabel, unitLabel }: {
  index: number; count: number; progress: number; progressLabel: string; unitLabel?: string;
}) {
  return <div className={styles.progressRow}>
      <div className={styles.progress} role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={count} aria-valuenow={progress}>
        <i style={{ transform: `scaleX(${progress / count})` }} />
      </div>
      <span>{unitLabel}{index + 1}<span className={styles.progressTotal}> / {count}</span></span>
    </div>;
}

export function PracticeFooter({ children, utilities }: { children: ReactNode; utilities?: ReactNode }) {
  return <footer className={styles.footer}>
    {utilities ? <div className={styles.footerTools} data-player-shortcuts>{utilities}</div> : null}
    <div className={styles.actions} role="group" aria-label="학습 진행" data-player-shortcuts>{children}</div>
  </footer>;
}

export function CycleProgress({ completed, target }: { completed: number; target: 3 | 5 }) {
  return <div className={styles.cycles} role="group" aria-label="완료한 듣기">
    <span className={styles.cycleDots} aria-hidden="true" data-expanded={target === 5}>
      {Array.from({ length: 5 }, (_, index) => <span className={styles.cycleStep} key={index} data-visible={index < target} data-complete={index < target ? completed > index : undefined}>
        <i>{completed > index ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12 4 4 8-9" /></svg> : null}</i>
      </span>)}
    </span>
    <span className={styles.screenReaderOnly} aria-live="polite" aria-atomic="true">필수 {Math.min(3, completed)} / 3{target === 5 ? ` · 추가 ${Math.max(0, completed - 3)} / 2` : ""}</span>
  </div>;
}

const learningInstructions = [
  "자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.",
  "자막을 보며 따라 말하고, 눈을 감고 한 번 더 말하세요.",
  "첫 단어를 힌트로 듣고, 자막 없이 두 번 말하세요.",
  "여러 문장을 따라 말하고, 눈을 감고 한 번 더 말하세요.",
  "각 문장의 첫 단어를 보고, 자막 없이 두 번 말하세요.",
  "목표어를 따라 말하고, 이어지는 한국어 뜻을 확인하세요.",
  "한국어를 보고 목표어로 말한 뒤, 정답을 확인하세요.",
  "한국어만 보고, 목표어 문장을 빠르게 말하세요."
];

export function PracticeContext({ name, localizedName, level, children }: {
  name: string; localizedName: string; level: number; children: ReactNode;
}) {
  return <header className={styles.lessonContext} aria-label="레슨 안내">
    <div className={styles.contextInner}>
    <div className={styles.lessonHeading}>
      <div className={styles.lessonName}>
        <strong>{name}</strong>
        {localizedName !== name ? <small>{localizedName}</small> : null}
      </div>
      <h1 id="player-title"><span aria-hidden="true">·</span>메타쉐도잉 레벨 {level}</h1>
    </div>
    <p id="practice-instruction" className={styles.instruction} aria-label="학습 방법">{learningInstructions[level - 1]}</p>
    {children}
    </div>
  </header>;
}

export function PracticeSection({ chapter, startsSection }: LessonSection) {
  if (!chapter && !startsSection) return null;
  return <div className={styles.chapter} aria-label="현재 챕터">
    {startsSection ? <hr className="section-divider" aria-label="구간 경계" /> : null}
    {chapter ? <div className={styles.chapterHeading}>
      <LessonIcon />
      <div className={styles.chapterTitle}>
        <h2>{chapter.target}</h2>
        {chapter.korean !== chapter.target ? <p lang="ko">{chapter.korean}</p> : null}
      </div>
      <span className={styles.chapterRule} aria-hidden="true" />
    </div> : null}
  </div>;
}
