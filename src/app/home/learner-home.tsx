"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLesson, type Language, type Lesson } from "@/lib/lessons";
import { getPlayerHref, readLastSelection, SessionSelection } from "@/lib/resume";
import { readLearningJournal, type ProgressRecord, type CompletionRecord } from "@/lib/learning-records";
import { RecordDetails } from "../completion-summary";
import { ArrowIcon, Brand, Page, PlayIcon } from "../ui";

function ResumeRow({ selection, catalog, progress }: { selection: SessionSelection; catalog: Lesson[]; progress: ProgressRecord | null }) {
  const router = useRouter();
  const lesson = getLesson(selection.lessonId, catalog);
  if (!lesson) return null;

  return (
    <button className="continuation-row" onClick={() => router.push(getPlayerHref(selection))}>
      <span className="round-icon"><PlayIcon /></span>
      <span className="continuation-copy">
        <strong>마지막 학습 계속하기</strong>
        <small>{selection.language === "english" ? "영어" : "일본어"} · {lesson.name} · 레벨 {selection.level} · 프레이즈 {progress && progress.lessonVersion === lesson.version ? progress.nextPhrase + 1 : 1} / {lesson.phraseCount}</small>
      </span>
      <ArrowIcon />
    </button>
  );
}

export function LearnerHome({ catalog }: { catalog: Lesson[] }) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("english");
  const [resume, setResume] = useState<SessionSelection | null>(null);
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  const [history, setHistory] = useState<CompletionRecord[]>([]);

  useEffect(() => {
    const selection = readLastSelection();
    const journal = readLearningJournal();
    setResume(selection && !journal.history.some(record => record.runId === selection.runId) ? selection : null);
    setProgress(journal.progress?.runId === selection?.runId ? journal.progress : null);
    setHistory(journal.history.toReversed());
  }, []);
  const visibleLessons = catalog.filter((lesson) => lesson.language === language);

  return (
    <Page className="home-page">
      <section className="learner-shell" aria-labelledby="home-title">
        <Brand compact />
        <h1 id="home-title">오늘도 한 프레이즈부터.</h1>
        {resume ? <ResumeRow selection={resume} catalog={catalog} progress={progress} /> : null}
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
        {history.length ? <section className="home-section completion-history" aria-label="완료 기록">
          <h2>완료 기록</h2>
          <ol>{history.map(record => <li key={record.runId}>
            <h3>{record.lessonName} · 레벨 {record.level}</h3>
            <RecordDetails record={record} />
          </li>)}</ol>
        </section> : null}
      </section>
    </Page>
  );
}
