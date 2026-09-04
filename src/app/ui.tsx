"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getLesson, Language, lessons, levelNames } from "@/lib/lessons";
import { readLastSelection, saveLastSelection, SessionSelection } from "@/lib/resume";

function MarkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 36 36" fill="none">
      <path d="M5 28V10c0-3 4-5 6-2l7 8 7-8c2-3 6-1 6 2v18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="arrow-icon" viewBox="0 0 24 24" fill="none">
      <path d="m9 4 8 8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" className="arrow-icon" viewBox="0 0 24 24" fill="none">
      <path d="m15 4-8 8 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" className="gear-icon" viewBox="0 0 24 24" fill="none">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm7.2 4a7.1 7.1 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.8 7.8 0 0 0-1.7-1L14.7 3h-4l-.4 3.1a7.8 7.8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.1 7.1 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.8 7.8 0 0 0 1.7 1l.4 3.1h4l.4-3.1a7.8 7.8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z" /></svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="play-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 4.8c0-1.23 1.35-1.98 2.4-1.33l9.05 5.64a3.4 3.4 0 0 1 0 5.78l-9.05 5.64A1.57 1.57 0 0 1 7 19.2V4.8Z" />
    </svg>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <MarkIcon />
      <span>Meta Shadowing</span>
    </div>
  );
}

function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`page ${className}`}>{children}</main>;
}

export function EntryForm() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "wrong-password" | "unavailable">("idle");
  const errorMessage = status === "wrong-password"
    ? "비밀번호가 올바르지 않습니다."
    : status === "unavailable"
      ? "지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요."
      : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch("/api/auth", {
        body: JSON.stringify({ password }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (response.ok) {
        window.location.assign("/home");
        return;
      }

      setStatus(response.status === 401 ? "wrong-password" : "unavailable");
    } catch {
      setStatus("unavailable");
    }
  }

  return (
    <Page className="entry-page">
      <section className="entry-shell" aria-labelledby="entry-title">
        <Brand />
        <div className="entry-copy">
          <h1 id="entry-title">나만의 문장으로,<br />여덟 번 다르게.</h1>
          <p>헤드폰을 끼고 오늘의 레슨을 시작하세요.</p>
        </div>
        <form className="entry-form" onSubmit={submit}>
          <label htmlFor="beta-password">베타 비밀번호</label>
          <input
            id="beta-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={status === "wrong-password"}
            aria-describedby={errorMessage ? "password-error" : undefined}
            required
          />
          {errorMessage ? <p id="password-error" className="password-error" role="alert">{errorMessage}</p> : null}
          <button className="primary-button" type="submit" disabled={status === "submitting"}>
            입장하기
          </button>
        </form>
        <p className="entry-footer">개인 학습 자료를 위한 비공개 베타</p>
      </section>
    </Page>
  );
}

function ResumeRow({ selection }: { selection: SessionSelection }) {
  const router = useRouter();
  const lesson = getLesson(selection.lessonId);
  if (!lesson) return null;

  return (
    <button className="continuation-row" onClick={() => router.push(`/player?lesson=${lesson.id}&level=${selection.level}`)}>
      <span className="round-icon"><PlayIcon /></span>
      <span className="continuation-copy">
        <strong>마지막 학습 계속하기</strong>
        <small>{selection.language === "english" ? "영어" : "일본어"} · {lesson.name} · 레벨 {selection.level} · {lesson.phraseCount}개 프레이즈</small>
      </span>
      <ArrowIcon />
    </button>
  );
}

export function LearnerHome() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("english");
  const [resume, setResume] = useState<SessionSelection | null>(null);

  useEffect(() => setResume(readLastSelection()), []);
  const visibleLessons = lessons.filter((lesson) => lesson.language === language);

  return (
    <Page className="home-page">
      <section className="learner-shell" aria-labelledby="home-title">
        <Brand compact />
        <h1 id="home-title">오늘도 한 프레이즈부터.</h1>
        {resume ? <ResumeRow selection={resume} /> : null}
        <section className="home-section" aria-labelledby="language-title">
          <h2 id="language-title">언어 선택</h2>
          <div className="open-list">
            <button className={`choice-row ${language === "english" ? "selected" : ""}`} onClick={() => setLanguage("english")}>
              <span><strong>English</strong><em>영어</em></span><ArrowIcon />
            </button>
            <button className={`choice-row ${language === "japanese" ? "selected" : ""}`} onClick={() => setLanguage("japanese")}>
              <span><strong>日本語</strong><em>일본어</em></span><ArrowIcon />
            </button>
          </div>
        </section>
        <section className="home-section" aria-labelledby="lesson-title">
          <h2 id="lesson-title">{language === "english" ? "영어 레슨" : "일본어 레슨"}</h2>
          <div className="open-list">
            {visibleLessons.map((lesson) => (
              <button className="lesson-row" key={lesson.id} onClick={() => router.push(`/setup?language=${language}&lesson=${lesson.id}`)}>
                <span className="lesson-symbol"><span /></span>
                <span><strong>{lesson.name}</strong><em>{lesson.localizedName}</em><small>{lesson.phraseCount}개 프레이즈</small></span>
                <ArrowIcon />
              </button>
            ))}
          </div>
        </section>
      </section>
    </Page>
  );
}

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

export function PlayerShell() {
  const params = useSearchParams();
  const lesson = getLesson(params.get("lesson")) ?? lessons[0];
  const requestedLevel = Number(params.get("level"));
  const level = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 8 ? requestedLevel : 1;

  return (
    <Page className="player-page">
      <header className="player-topbar"><button aria-label="이전" className="icon-button"><BackIcon /></button><Brand /><button aria-label="설정" className="icon-button"><GearIcon /></button></header>
      <div className="player-progress"><span>1 / {lesson.phraseCount}</span><div><i /></div></div>
      <header className="chapter-header"><strong>{lesson.name}</strong><span>{lesson.localizedName}</span></header>
      <section className="practice-shell" aria-labelledby="player-title">
        <h1 id="player-title">메타쉐도잉 레벨 {level}</h1>
        <div className="practice-canvas"><span>{lesson.language === "english" ? "I" : "私"}</span><small>{lesson.language === "english" ? "나는" : "나는"}</small></div>
        <div className="playback-line"><i /><span>00:00.0</span><div><b /></div><span>00:03.2</span></div>
        <p className="cycle-status">필수 <strong>1 / 3</strong></p>
        <div className="player-actions">
          <button>자막 보기</button><button>다시 듣기</button><button className="continue">계속</button>
        </div>
      </section>
      <nav className="playback-dock" aria-label="재생 제어"><button>이전</button><button className="dock-play" aria-label="재생 또는 일시정지"><PauseIcon /></button><button>다음</button></nav>
    </Page>
  );
}
