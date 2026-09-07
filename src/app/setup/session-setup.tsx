"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { levelNames, type Lesson } from "@/lib/lessons";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { isGroupSize } from "@/lib/phrase-groups";
import { DEFAULT_SESSION_SETTINGS, readSessionPreferences, resolveSessionSettings, saveSessionPreferences, type SessionSettings } from "@/lib/session-settings";
import { AudioSessionControls } from "../audio-session-controls";
import { RapidSessionControls } from "../rapid-session-controls";
import { BackIcon, GearIcon, Page } from "../ui";
import { SessionOptions } from "./session-options";
import styles from "./setup.module.css";

const pathOffsets = [0, 1, 2, 1, 0, 1, 2, 1];

export function SessionSetup({ lesson, defaults = DEFAULT_SESSION_SETTINGS }: { lesson: Lesson; defaults?: SessionSettings }) {
  const router = useRouter();
  const language = lesson.language;
  const [level, setLevel] = useState(1);
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setSettings(readSessionPreferences(defaults)); setReady(true); }, [defaults]);

  function changeSettings(changes: Partial<SessionSettings>) {
    setSettings(previous => resolveSessionSettings(changes, previous));
    saveSessionPreferences(changes);
  }

  function start(): void {
    const selection = { ...settings, language, lessonId: lesson.id, level, runId: crypto.randomUUID() };
    saveLastSelection(selection);
    router.push(getPlayerHref(selection));
  }

  return (
    <Page className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <button type="button" className={styles.backLink} onClick={() => router.push("/home")}><BackIcon />레슨</button>
          <div className={styles.titleBlock}>
            <h1 id="setup-title">{lesson.name}</h1>
            <div className={styles.lessonMeta}>
              {lesson.name !== lesson.localizedName ? <span>{lesson.localizedName}</span> : null}
              <span>{lesson.phraseCount}개 프레이즈</span>
            </div>
          </div>
          <button type="button" ref={optionsRef} className={styles.optionsButton} aria-label="세션 설정" aria-haspopup="dialog" aria-expanded={optionsOpen} aria-controls="session-options" disabled={!ready} onClick={() => setOptionsOpen(true)}><GearIcon /></button>
        </header>
        <section className={styles.stageSection} aria-labelledby="level-title">
          <h2 id="level-title" className={styles.sectionTitle}>학습 단계</h2>
          <ol className={styles.levelPath} aria-labelledby="level-title">
            {levelNames.map((name, index) => {
              const number = index + 1;
              return (
                <li className={styles.levelItem} key={name} style={{ "--path-offset": pathOffsets[index] } as CSSProperties}>
                  {index < levelNames.length - 1 ? <svg className={styles.connector} aria-hidden="true" viewBox="0 0 2 100" preserveAspectRatio="none">
                    <line x1={pathOffsets[index]} y1="0" x2={pathOffsets[index + 1]} y2="100" vectorEffect="non-scaling-stroke" />
                  </svg> : null}
                  <button type="button" className={styles.levelButton} aria-pressed={level === number} onClick={() => setLevel(number)}>
                    <span className={styles.levelNode}>{number}</span><strong className={styles.levelName}>{name}</strong>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
        <div className={styles.startArea}>
          <button className={`primary-button ${styles.startButton}`} disabled={!ready} onClick={start}>학습 시작</button>
        </div>
        {optionsOpen ? <SessionOptions onClose={() => { setOptionsOpen(false); optionsRef.current?.focus(); }}>
          <div className={`session-controls ${styles.controls}`}>
            {level === 4 || level === 5 ? <label className="audio-setting">묶음 크기
              <select value={settings.groupSize} onChange={(event) => {
                const size = Number(event.target.value);
                if (isGroupSize(size)) changeSettings({ groupSize: size });
              }}>
                {[2, 3, 4].map(size => <option key={size} value={size}>{size}개</option>)}
              </select>
            </label> : null}
            {level >= 6 ? <RapidSessionControls level={level} settings={settings} onChange={changeSettings} /> : <AudioSessionControls level={level} settings={{ ...settings, playbackRate: settings.speed }} onChange={(changes) => {
              const { playbackRate, ...rest } = changes;
              changeSettings({ ...rest, ...(playbackRate !== undefined ? { speed: playbackRate } : {}) });
            }} />}
          </div>
        </SessionOptions> : null}
      </div>
    </Page>
  );
}
