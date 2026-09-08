"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Brain, Check, Headphones, Languages, Layers, Mic, TextCursorInput, WholeWord } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverArrow, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { Lesson } from "@/lib/lessons";
import { learningInstructions, learningStages } from "@/lib/learning-stages";
import { completedStagesForLesson } from "@/lib/learning-records";
import { nextPracticeForLesson } from "@/lib/next-practice";
import { getPlayerHref } from "@/lib/resume";
import { createRunId } from "@/lib/run-id";
import { playStageSound } from "@/lib/stage-sound";
import { DEFAULT_SESSION_SETTINGS, resolveSessionSettings, type SessionSettings } from "@/lib/session-settings";
import { useCloudPreferences } from "../cloud-preferences-provider";
import { CloseIcon, PlayIcon } from "../ui";
import { useBrowseScroll } from "../browse-shell";
import { LessonHistoryDialog } from "./lesson-history-dialog";
import styles from "./setup.module.css";

const pathOffsets = [0, 1, 2, 1];
const methodIcons = [Headphones, Brain, TextCursorInput, Layers, WholeWord, Languages, Languages, Mic];

const stageRing = <span className={styles.stageRing} data-stage-ring="" aria-hidden="true">
  <svg viewBox="0 0 100 86" preserveAspectRatio="none" focusable="false">
    <ellipse className={styles.stageRingTrack} cx="50" cy="43" rx="48" ry="41" vectorEffect="non-scaling-stroke" />
    <ellipse className={styles.stageRingArc} data-stage-arc="" cx="50" cy="43" rx="48" ry="41" pathLength="100" vectorEffect="non-scaling-stroke" />
  </svg>
</span>;

export function SessionSetup({ lesson, defaults = DEFAULT_SESSION_SETTINGS, initialStage }: { lesson: Lesson; defaults?: SessionSettings; initialStage?: number }) {
  const router = useRouter();
  const cloud = useCloudPreferences()!;
  const cloudJournal = cloud.journal, overrides = cloud.profile.overrides;
  const language = lesson.language;
  const [stage, setStage] = useState(1);
  const level = learningStages[stage - 1].level;
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [previewStage, setPreviewStage] = useState<number | null>(null);
  const stageScrollRef = useBrowseScroll(`stages:${lesson.id}`);
  const shellScrollRef = useBrowseScroll(`stage-shell:${lesson.id}`);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [currentPractice, setCurrentPractice] = useState<ReturnType<typeof nextPracticeForLesson>>({ stage: 1, progress: null, review: false });
  useEffect(() => {
    setSettings(resolveSessionSettings(overrides,defaults));
    const journal = cloudJournal;
    const current = nextPracticeForLesson(journal, lesson);
    setCompletedStages(completedStagesForLesson(journal.history, lesson));
    setCurrentPractice(current);
    setStage(initialStage ?? current.stage);
    setReady(true);
  }, [defaults, lesson, initialStage, cloudJournal, overrides]);

  function start(): void {
    playStageSound("start");
    const selection = { ...settings, language, lessonId: lesson.id, level, stage, runId: createRunId() };
    router.push(getPlayerHref(selection));
  }

  function startCurrent(): void {
    playStageSound("start");
    const current = nextPracticeForLesson(cloudJournal, lesson);
    const saved = current.progress;
    const selection = { ...(saved?.settings ?? settings), language, lessonId: lesson.id,
      level: learningStages[current.stage - 1].level, stage: current.stage, runId: saved?.runId ?? createRunId() };
    router.push(getPlayerHref(selection));
  }

  return (
      <div className={styles.shell} ref={shellScrollRef}>
        <Card variant="lesson" className={styles.bookSummary} aria-labelledby="setup-title">
          <CardHeader className={styles.bookHeading}>
            <Badge variant="book" aria-hidden="true"><BookOpen /></Badge>
            <div className={styles.titleBlock}>
            <CardTitle id="setup-title" role="heading" aria-level={1}>{lesson.name}</CardTitle>
            <CardDescription className={styles.lessonMeta}>
              {lesson.name !== lesson.localizedName ? <span>{lesson.localizedName}</span> : null}
              <span>{lesson.sectionCount}개 섹션 · {lesson.phraseCount}개 프레이즈</span>
            </CardDescription>
            </div>
          </CardHeader>
          <CardContent className={styles.bookContent}>
            <div className={styles.bookProgress}>
              <CardDescription>완료 {completedStages.length} / 16</CardDescription>
              <span>{Math.round(completedStages.length / learningStages.length * 100)}%</span>
            </div>
            <Progress value={completedStages.length} max={learningStages.length} aria-label="완료한 스테이지" />
            <div className={styles.bookActions}>
            <LessonHistoryDialog lesson={lesson} disabled={!ready} />
            <Button className={styles.selectedStage} size="lg" disabled={!ready} aria-label={`현재 스테이지 ${currentPractice.stage} 시작`} onClick={startCurrent}>
              <PlayIcon data-icon="inline-start" />
              <span className={styles.selectedStageCopy}>
                <span className={styles.selectedStageMeta}>{currentPractice.review ? "복습" : currentPractice.progress ? "이어서 학습" : "스테이지"} {currentPractice.stage} · Lv {learningStages[currentPractice.stage - 1].level}</span>
                <strong className={styles.selectedStageName}>{learningStages[currentPractice.stage - 1].name}</strong>
              </span>
            </Button>
            </div>
          </CardContent>
        </Card>
        <section className={styles.stageSection} aria-labelledby="level-title">
          <h2 id="level-title" className="sr-only">학습 단계</h2>
          <ScrollArea className={styles.stageScroll} viewportProps={{ ref: stageScrollRef, role: "region", "aria-label": "학습 단계 목록", tabIndex: -1 }}>
          <div className={styles.pathInset}>
          <ToggleGroup type="single" orientation="vertical" variant="path" value={previewStage === null ? "" : String(previewStage)} aria-labelledby="level-title" className="w-full" onValueChange={value => {
            const selected = Number(value);
            if (Number.isInteger(selected) && selected >= 1 && selected <= learningStages.length) setStage(selected);
          }}>
          <ol className={styles.levelPath} aria-labelledby="level-title">
            {learningStages.map(({ stage: number, level: methodLevel, name }, index) => {
              const offset = pathOffsets[index % pathOffsets.length];
              const nextOffset = pathOffsets[(index + 1) % pathOffsets.length];
              const direction = nextOffset - offset;
              const completed = completedStages.includes(number);
              const current = ready && !currentPractice.review && number === currentPractice.stage;
              const MethodIcon = completed ? Check : methodIcons[methodLevel - 1];
              return (
                <li className={styles.levelItem} key={number} style={{ "--path-offset": offset } as CSSProperties}>
                  {index < learningStages.length - 1 ? <svg className={styles.connector} aria-hidden="true" viewBox="0 0 2 100" preserveAspectRatio="none">
                    <path d={`M ${offset} 0 C ${offset + direction * 1.3} 8, ${nextOffset + direction * .15} 40, ${nextOffset} 100`} vectorEffect="non-scaling-stroke" />
                  </svg> : null}
                  <Popover open={previewStage === number} onOpenChange={open => {
                    setPreviewStage(open ? number : null);
                    if (open) {
                      playStageSound("select");
                      setStage(number);
                    }
                  }}>
                  <PopoverTrigger asChild>
                  <ToggleGroupItem value={String(number)} className={styles.levelButton} disabled={!ready}
                    aria-label={`${number} ${name} Lv ${methodLevel}${completed ? " · 완료" : ""}`} data-completed={completed} aria-current={current ? "step" : undefined}>
                    <span className={styles.levelNode}>{current ? stageRing : null}<MethodIcon aria-hidden="true" /><Badge variant="stage" className={styles.stageNumber}>{number}</Badge></span>
                    <span className={styles.levelLabel}><Badge variant="secondary">Lv {methodLevel}</Badge><strong className={styles.levelName}>{name}</strong></span>
                  </ToggleGroupItem>
                  </PopoverTrigger>
                  <PopoverContent variant="primary" className={styles.stagePreview} side="bottom" sideOffset={14} collisionPadding={20} hideWhenDetached
                    aria-labelledby={`stage-${number}-title`} aria-describedby={`stage-${number}-description`}>
                    <PopoverArrow />
                    <ScrollArea className={styles.previewScroll} viewportProps={{ role: "region", "aria-label": "스테이지 안내", tabIndex: 0 }}>
                    <div className={styles.previewBody}>
                    <PopoverHeader>
                      <div className={styles.previewHeading}>
                        <PopoverTitle id={`stage-${number}-title`} role="heading" aria-level={3}>{name}</PopoverTitle>
                        <Button type="button" variant="ghost-inverse" size="icon" aria-label="스테이지 안내 닫기" onClick={() => setPreviewStage(null)}><CloseIcon /></Button>
                      </div>
                    </PopoverHeader>
                    <PopoverDescription tone="display" size="sm" id={`stage-${number}-description`}>{learningInstructions[methodLevel - 1]}</PopoverDescription>
                    </div>
                    </ScrollArea>
                    <div className={styles.previewActions}>
                      <Button variant="inverse" size="lg" className="min-w-0 flex-1" disabled={!ready} onClick={start}><PlayIcon />학습 시작</Button>
                    </div>
                  </PopoverContent>
                  </Popover>
                </li>
              );
            })}
          </ol>
          </ToggleGroup>
          </div>
          </ScrollArea>
        </section>
      </div>
  );
}
