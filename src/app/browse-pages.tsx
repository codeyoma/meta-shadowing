"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, CirclePlay, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { completedStagesForLesson, reconcileLearningJournal, type Journal } from "@/lib/learning-records";
import { browseHref, stageHref } from "@/lib/browse-navigation";
import { nextPracticeForLesson } from "@/lib/next-practice";
import { stageForLevel } from "@/lib/learning-stages";
import { useBrowse, useBrowseScroll } from "./browse-shell";
import { VersionNotice } from "./version-notice";
import { RecordDetails } from "./completion-summary";
import styles from "./browse.module.css";

export function BrowsePageContent({ title, region, children, before }: { title: string; region: string; children: ReactNode; before?: ReactNode }) {
  const { selection } = useBrowse();
  const ref = useBrowseScroll(`${region}:${selection.language}`);
  return <ScrollArea className={styles.scroll} viewportProps={{ ref, role: "region", "aria-label": region }}>
    <div className={styles.body}>
      <div className={styles.titleRow}>{before}<h1 className={styles.heading}>{title}</h1></div>
      {children}
    </div>
  </ScrollArea>;
}

export function LanguagePage() {
  return <BrowsePageContent title="언어 선택" region="언어 목록">
    <ul className={styles.rows}>
      {[{ language: "english", name: "영어", native: "English" }, { language: "japanese", name: "일본어", native: "日本語" }].map(item =>
        <li key={item.language}><Button asChild variant="choice" size="row" className={styles.row}>
          <Link href={`/lessons?language=${item.language}`} scroll={false}>
            <span className={styles.flag} aria-hidden="true"><Flag /></span>
            <span className={styles.copy}><strong>{item.name}</strong><small>{item.native}</small></span>
            <ChevronRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button></li>)}
    </ul>
  </BrowsePageContent>;
}

export function LessonPage() {
  const { catalog, selection } = useBrowse();
  const [journal, setJournal] = useState<Journal>({ progress: null, history: [], studyDays: [] });
  const [reset, setReset] = useState<{ storageFailed: boolean } | null>(null);
  useEffect(() => {
    const value = reconcileLearningJournal(catalog);
    setJournal(value);
    if (value.resetLessonId) setReset({ storageFailed: value.storageFailed });
  }, [catalog]);
  const lessons = catalog.filter(lesson => lesson.language === selection.language);
  const completed = lessons.reduce((sum, lesson) => sum + completedStagesForLesson(journal.history, lesson).length, 0);
  const history = journal.history.filter(record => record.language === selection.language).toReversed();
  return <BrowsePageContent title={`${selection.language === "english" ? "영어" : "일본어"} 레슨`} region="레슨 목록">
    {reset ? <VersionNotice storageFailed={reset.storageFailed} /> : null}
    {lessons.length ? <div className={styles.summary}>
      <div className={styles.summaryLine}><span>완료한 스테이지</span><span>{completed} / {lessons.length * 16}</span></div>
      <Progress value={completed} max={lessons.length * 16} aria-label="레슨 학습 진척도" />
    </div> : null}
    <ul className={styles.rows}>
      {lessons.map((lesson, index) => {
        const count = completedStagesForLesson(journal.history, lesson).length;
        const current = nextPracticeForLesson(journal, lesson);
        return <li key={lesson.id}><Button asChild variant="choice" size="row" className={styles.row}>
          <Link href={stageHref(lesson.id)} scroll={false}>
            <span className={styles.book} data-tone={index % 3} aria-hidden="true"><span>BOOK {String(index + 1).padStart(2, "0")}</span><BookOpen /></span>
            <span className={styles.copy}>
              <strong>{lesson.name}</strong>
              {lesson.localizedName !== lesson.name ? <small>{lesson.localizedName}</small> : null}
              <small>{lesson.sectionCount}개 섹션 · {lesson.phraseCount}개 프레이즈</small>
              <span className={styles.progressText}><CirclePlay aria-hidden="true" />{count ? `${count} / 16 스테이지 완료` : current.progress ? `스테이지 ${current.stage} 이어서 학습` : "시작하기"}</span>
            </span>
            <ChevronRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button></li>;
      })}
    </ul>
    {!lessons.length ? <Empty role="status"><EmptyHeader><EmptyDescription>아직 게시된 레슨이 없습니다.</EmptyDescription></EmptyHeader>
      <Button asChild variant="outline"><Link href="/languages" scroll={false}>다른 언어 선택</Link></Button>
    </Empty> : null}
    {history.length ? <section className={styles.section} aria-label="완료 기록"><h2 className={styles.subheading}>완료 기록</h2>
      <ol className={styles.history}>{history.map(record => <li key={record.runId}>
        <h3>{record.lessonName} · 레벨 {record.level}</h3>
        <p>스테이지 {stageForLevel(record.level, record.stage)}</p>
        <RecordDetails record={record} />
      </li>)}</ol>
    </section> : null}
  </BrowsePageContent>;
}

export function SettingsPage() {
  const { selection } = useBrowse();
  return <BrowsePageContent title="설정" region="설정 목록">
    <ul className={styles.rows}><li><Button asChild variant="choice" size="row" className="w-full">
      <Link href={browseHref("session", selection)} scroll={false}>
        <span className={styles.copy}><strong>세션 설정</strong></span><ChevronRight aria-hidden="true" data-icon="inline-end" />
      </Link>
    </Button></li></ul>
  </BrowsePageContent>;
}
