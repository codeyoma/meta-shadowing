"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { levelNames, type Lesson } from "@/lib/lessons";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { isGroupSize } from "@/lib/phrase-groups";
import { DEFAULT_SESSION_SETTINGS, readSessionPreferences, resolveSessionSettings, saveSessionPreferences, type SessionSettings } from "@/lib/session-settings";
import { AudioSessionControls } from "../audio-session-controls";
import { RapidSessionControls } from "../rapid-session-controls";
import { ArrowIcon, BackIcon, Brand, Page } from "../ui";

export function SessionSetup({ lesson, defaults = DEFAULT_SESSION_SETTINGS }: { lesson: Lesson; defaults?: SessionSettings }) {
  const router = useRouter();
  const language = lesson.language;
  const [level, setLevel] = useState(1);
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
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
                <button className={`level-row ${level === number ? "selected" : ""}`} aria-pressed={level === number} key={name} onClick={() => setLevel(number)}>
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
        </section>
        <button className="primary-button start-button" disabled={!ready} onClick={start}>학습 시작</button>
      </section>
    </Page>
  );
}
