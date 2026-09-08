"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLesson, type Language, type Lesson } from "@/lib/lessons";
import { isLanguage, LANGUAGE_CATALOG, languageInfo } from "@/lib/languages";
import { getPlayerHref, readLastSelection, saveLastSelection, SessionSelection } from "@/lib/resume";
import { createRunId } from "@/lib/run-id";
import { stageForLevel } from "@/lib/learning-stages";
import { reconcileLearningJournal, type ProgressRecord, type CompletionRecord } from "@/lib/learning-records";
import { VersionNotice } from "../version-notice";
import { RecordDetails } from "../completion-summary";
import { ArrowIcon, LessonIcon, Page, PlayIcon } from "../ui";
import { LearnerTopNavigation } from "../learner-top-navigation";
import { OnlineInstallHelp } from "../online-install-help";
import { BottomNavigation, type BrowseDestination } from "../bottom-navigation";
import styles from "../learner.module.css";

function ResumeRow({ selection, catalog, progress }: { selection: SessionSelection; catalog: Lesson[]; progress: ProgressRecord | null }) {
  const router = useRouter();
  const lesson = getLesson(selection.lessonId, catalog);
  if (!lesson) return null;

  return (
    <Button variant="choice" size="row" className="w-full" onClick={() => router.push(getPlayerHref(selection))}>
      <PlayIcon />
      <span className={styles.rowCopy}>
        <strong>마지막 학습 계속하기</strong>
        <small>{languageInfo(selection.language).koreanLabel} · {lesson.name} · 레벨 {selection.level} · 스테이지 {stageForLevel(selection.level, selection.stage)} · 프레이즈 {progress && progress.lessonVersion === lesson.version ? progress.nextPhrase + 1 : 1} / {lesson.phraseCount}</small>
      </span>
      <ArrowIcon />
    </Button>
  );
}

export function LearnerHome({ catalog, initialTab = "languages", initialLanguage = "english", lessonId }: {
  catalog: Lesson[]; initialTab?: "languages" | "lessons"; initialLanguage?: Language; lessonId?: string;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [activeTab, setActiveTab] = useState<BrowseDestination>(initialTab);
  const languageHeading = useRef<HTMLHeadingElement>(null);
  const lessonHeading = useRef<HTMLHeadingElement>(null);
  const [resume, setResume] = useState<SessionSelection | null>(null);
  const [progress, setProgress] = useState<ProgressRecord | null>(null);
  const [history, setHistory] = useState<CompletionRecord[]>([]);
  const [versionReset, setVersionReset] = useState<{ storageFailed: boolean } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
    setLanguage(initialLanguage);
    if (initialTab === "lessons") lessonHeading.current?.scrollIntoView({ block: "start" });
  }, [initialTab, initialLanguage]);

  useEffect(() => {
    const selection = readLastSelection();
    const journal = reconcileLearningJournal(catalog);
    if (journal.resetLessonId) {
      setVersionReset({ storageFailed: journal.storageFailed });
      if (selection?.lessonId === journal.resetLessonId) {
        selection.runId = createRunId();
        saveLastSelection(selection);
      }
    }
    setResume(selection && !journal.history.some(record => record.runId === selection.runId) ? selection : null);
    setProgress(journal.progress?.runId === selection?.runId ? journal.progress : null);
    setHistory(journal.history.toReversed());
  }, [catalog]);
  const visibleLessons = catalog.filter((lesson) => lesson.language === language);
  const currentLesson = visibleLessons.find(lesson => lesson.id === (lessonId ?? resume?.lessonId)) ?? visibleLessons[0];

  function navigate(destination: BrowseDestination) {
    if (destination === "languages" || destination === "lessons") {
      setActiveTab(destination);
      const heading = destination === "languages" ? languageHeading.current : lessonHeading.current;
      heading?.scrollIntoView({ block: "start" });
      return;
    }
    if (!currentLesson) return;
    const query = new URLSearchParams({ language, lesson: currentLesson.id });
    if (destination === "settings") query.set("panel", "settings");
    router.push(`/setup?${query}`);
  }

  return (
    <Page className={styles.homePage}>
      <section className={styles.homeShell} aria-labelledby="home-title">
        <LearnerTopNavigation />
        <ScrollArea className={styles.homeScroll} viewportProps={{ role: "region", "aria-label": "레슨과 학습 기록" }}>
        <div className={styles.homeBody}>
        <h1 id="home-title" className={styles.homeTitle}>오늘도 한 프레이즈부터.</h1>
        {versionReset ? <VersionNotice storageFailed={versionReset.storageFailed} /> : null}
        {resume ? <ResumeRow selection={resume} catalog={catalog} progress={progress} /> : null}
        <section className={styles.homeSection} aria-labelledby="language-title">
          <h2 ref={languageHeading} id="language-title">언어 선택</h2>
          <ToggleGroup type="single" variant="choice" value={language} onValueChange={value => {
            if (isLanguage(value)) setLanguage(value);
          }} aria-labelledby="language-title" className="grid w-full grid-cols-2" spacing={3}>
            {LANGUAGE_CATALOG.map(item => <ToggleGroupItem key={item.id} value={item.id} className="min-w-0 p-4">
              <span className={styles.rowCopy}><strong><span aria-hidden="true">{item.flag}</span> {item.nativeLabel}</strong><em>{item.koreanLabel}</em></span><ArrowIcon />
            </ToggleGroupItem>)}
          </ToggleGroup>
        </section>
        <section className={styles.homeSection} aria-labelledby="lesson-title">
          <h2 ref={lessonHeading} id="lesson-title">{languageInfo(language).koreanLabel} 레슨</h2>
          <div className={styles.rows}>
            {visibleLessons.map((lesson) => (
              <Button variant="choice" size="row" key={lesson.id} onClick={() => router.push(`/setup?language=${language}&lesson=${lesson.id}`)}>
                <LessonIcon />
                <span className={styles.rowCopy}><strong>{lesson.name}</strong>{lesson.localizedName !== lesson.name ? <em>{lesson.localizedName}</em> : null}<small>{lesson.phraseCount}개 프레이즈</small></span>
                <ArrowIcon />
              </Button>
            ))}
            {visibleLessons.length === 0 ? (
              <Empty role="status"><EmptyHeader><EmptyDescription>아직 게시된 레슨이 없습니다.</EmptyDescription></EmptyHeader></Empty>
            ) : null}
          </div>
        </section>
        {history.length ? <section className={styles.homeSection} aria-label="완료 기록">
          <h2>완료 기록</h2>
          <ol className={styles.history}>{history.map(record => <li key={record.runId}>
            <h3>{record.lessonName} · 레벨 {record.level}</h3>
            <p>스테이지 {stageForLevel(record.level, record.stage)}</p>
            <RecordDetails record={record} />
          </li>)}</ol>
        </section> : null}
        <OnlineInstallHelp />
        </div>
        </ScrollArea>
      </section>
      <BottomNavigation active={activeTab} onSelect={navigate} lessonAvailable={!!currentLesson} />
    </Page>
  );
}
