"use client";

import { useSearchParams } from "next/navigation";
import { getLesson, lessons } from "@/lib/lessons";
import { BackIcon, Brand, GearIcon, Page, PauseIcon } from "../ui";

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
