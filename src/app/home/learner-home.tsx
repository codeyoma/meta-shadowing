"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLesson, type Language, type Lesson } from "@/lib/lessons";
import { readLastSelection, SessionSelection } from "@/lib/resume";
import { ArrowIcon, Brand, Page, PlayIcon } from "../ui";

function ResumeRow({ selection, catalog }: { selection: SessionSelection; catalog: Lesson[] }) {
  const router = useRouter();
  const lesson = getLesson(selection.lessonId, catalog);
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

export function LearnerHome({ catalog }: { catalog: Lesson[] }) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("english");
  const [resume, setResume] = useState<SessionSelection | null>(null);

  useEffect(() => setResume(readLastSelection()), []);
  const visibleLessons = catalog.filter((lesson) => lesson.language === language);

  return (
    <Page className="home-page">
      <section className="learner-shell" aria-labelledby="home-title">
        <Brand compact />
        <h1 id="home-title">오늘도 한 프레이즈부터.</h1>
        {resume ? <ResumeRow selection={resume} catalog={catalog} /> : null}
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
            {visibleLessons.length === 0 ? (
              <p className="empty-lessons" role="status">아직 게시된 레슨이 없습니다.</p>
            ) : null}
          </div>
        </section>
      </section>
    </Page>
  );
}
