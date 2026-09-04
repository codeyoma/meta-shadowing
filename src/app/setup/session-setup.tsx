"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getLesson, lessons, levelNames } from "@/lib/lessons";
import { saveLastSelection, SessionSelection } from "@/lib/resume";
import { ArrowIcon, BackIcon, Brand, Page } from "../ui";

export function SessionSetup() {
  const router = useRouter();
  const params = useSearchParams();
  const lesson = useMemo(() => getLesson(params.get("lesson")) ?? lessons[0], [params]);
  const language = lesson.language;
  const [level, setLevel] = useState(1);
  const [mode, setMode] = useState<SessionSelection["mode"]>("manual");
  const [display, setDisplay] = useState<SessionSelection["display"]>("current");
  const [speed, setSpeed] = useState(1);

  function start(): void {
    saveLastSelection({ language, lessonId: lesson.id, level, mode, display, speed });
    router.push(`/player?language=${language}&lesson=${lesson.id}&level=${level}`);
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
            <div className="segment-control" aria-label="학습 방식">
              <button className={mode === "manual" ? "selected" : ""} onClick={() => setMode("manual")}>수동</button>
              <button className={mode === "automatic" ? "selected" : ""} onClick={() => setMode("automatic")}>자동</button>
            </div>
            <div className="segment-control" aria-label="표시 방식">
              <button className={display === "current" ? "selected" : ""} onClick={() => setDisplay("current")}>현재 단어</button>
              <button className={display === "cumulative" ? "selected" : ""} onClick={() => setDisplay("cumulative")}>누적 단어</button>
            </div>
            <div className="segment-control" aria-label="재생 속도">
              <button onClick={() => setSpeed(speed === 1 ? 0.75 : 1)}>재생속도 {speed.toFixed(2).replace(".00", "")}×</button>
            </div>
          </div>
        </section>
        <button className="primary-button start-button" onClick={start}>학습 시작</button>
      </section>
    </Page>
  );
}
