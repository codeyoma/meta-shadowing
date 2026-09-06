"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { levelNames, type Lesson } from "@/lib/lessons";
import { getPlayerHref, saveLastSelection, SessionSelection } from "@/lib/resume";
import { AudioSessionControls } from "../audio-session-controls";
import { ArrowIcon, BackIcon, Brand, Page } from "../ui";

export function SessionSetup({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const language = lesson.language;
  const [level, setLevel] = useState(1);
  const [mode, setMode] = useState<SessionSelection["mode"]>("manual");
  const [display, setDisplay] = useState<SessionSelection["display"]>("current");
  const [speed, setSpeed] = useState(1);
  const [advanceDelayMs, setAdvanceDelayMs] = useState(1000);
  const [groupSize, setGroupSize] = useState(2);

  function start(): void {
    const selection = { language, lessonId: lesson.id, level, mode, display, speed, advanceDelayMs, groupSize };
    saveLastSelection(selection);
    router.push(getPlayerHref(selection));
  }

  return (
    <Page className="setup-page">
      <header className="quiet-header"><Brand /></header>
      <section className="setup-shell" aria-labelledby="setup-title">
        <button className="back-link" onClick={() => router.push("/home")}><BackIcon /> 레슨</button>
        <div className="lesson-heading">
          <p>{lesson.name}</p>
          <h1 id="setup-title">{lesson.localizedName}</h1>
          <span>{lesson.phraseCount}개 프레이즈</span>
        </div>
        <section className="setup-section" aria-labelledby="level-title">
          <h2 id="level-title">학습 단계</h2>
          <div className="level-list">
            {levelNames.map((name, index) => {
              const number = index + 1;
              return (
                <button className={`level-row ${level === number ? "selected" : ""}`} key={name} onClick={() => setLevel(number)}>
                  <span>{number}</span><strong>{name}</strong><ArrowIcon />
                </button>
              );
            })}
          </div>
        </section>
        <section className="setup-section" aria-labelledby="session-title">
          <h2 id="session-title">세션 설정</h2>
          <div className="session-controls">
            {level === 4 || level === 5 ? <label className="audio-setting">묶음 크기
              <select value={groupSize} onChange={(event) => setGroupSize(Number(event.target.value))}>
                {[2, 3, 4].map(size => <option key={size} value={size}>{size}개</option>)}
              </select>
            </label> : null}
            <AudioSessionControls settings={{ mode, playbackRate: speed, advanceDelayMs }} onChange={(settings) => {
              if (settings.mode !== undefined) setMode(settings.mode);
              if (settings.playbackRate !== undefined) setSpeed(settings.playbackRate);
              if (settings.advanceDelayMs !== undefined) setAdvanceDelayMs(settings.advanceDelayMs);
            }} />
            {level >= 6 ? <div className="segment-control" aria-label="표시 방식">
              <button className={display === "current" ? "selected" : ""} onClick={() => setDisplay("current")}>현재 단어</button>
              <button className={display === "cumulative" ? "selected" : ""} onClick={() => setDisplay("cumulative")}>누적 단어</button>
            </div> : null}
          </div>
        </section>
        <button className="primary-button start-button" onClick={start}>학습 시작</button>
      </section>
    </Page>
  );
}
