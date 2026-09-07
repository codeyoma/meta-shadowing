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
import { completedStagesForLesson, readLearningJournal } from "@/lib/learning-records";
import { nextPracticeForLesson } from "@/lib/next-practice";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { createRunId } from "@/lib/run-id";
import { DEFAULT_SESSION_SETTINGS, readSessionPreferences, type SessionSettings } from "@/lib/session-settings";
import { browseHref } from "@/lib/browse-navigation";
import { CloseIcon, GearIcon, PlayIcon } from "../ui";
import { useBrowseScroll } from "../browse-shell";
import styles from "./setup.module.css";

const pathOffsets = [0, 1, 2, 1];
const pathBands = ["bee", "fox", "cardinal", "beetle"];
const methodIcons = [Headphones, Brain, TextCursorInput, Layers, WholeWord, Languages, Languages, Mic];

export function SessionSetup({ lesson, defaults = DEFAULT_SESSION_SETTINGS, initialStage }: { lesson: Lesson; defaults?: SessionSettings; initialStage?: number }) {
  const router = useRouter();
  const language = lesson.language;
  const [stage, setStage] = useState(1);
  const level = learningStages[stage - 1].level;
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [previewStage, setPreviewStage] = useState<number | null>(null);
  const [compactLandscape, setCompactLandscape] = useState(false);
  const stageScrollRef = useBrowseScroll(`stages:${lesson.id}`);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [currentPractice, setCurrentPractice] = useState<ReturnType<typeof nextPracticeForLesson>>({ stage: 1, progress: null, review: false });
  useEffect(() => {
    const media = window.matchMedia("(min-width: 560px) and (max-height: 500px)");
    const update = () => setCompactLandscape(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setSettings(readSessionPreferences(defaults));
    const journal = readLearningJournal();
    const current = nextPracticeForLesson(journal, lesson);
    setCompletedStages(completedStagesForLesson(journal.history, lesson));
    setCurrentPractice(current);
    setStage(initialStage ?? current.stage);
    setReady(true);
  }, [defaults, lesson, initialStage]);

  function start(): void {
    const selection = { ...settings, language, lessonId: lesson.id, level, stage, runId: createRunId() };
    saveLastSelection(selection);
    router.push(getPlayerHref(selection));
  }

  function startCurrent(): void {
    const current = nextPracticeForLesson(readLearningJournal(), lesson);
    const saved = current.progress;
    const selection = { ...(saved?.settings ?? settings), language, lessonId: lesson.id,
      level: learningStages[current.stage - 1].level, stage: current.stage, runId: saved?.runId ?? createRunId() };
    saveLastSelection(selection);
    router.push(getPlayerHref(selection));
  }

  return (
      <div className={styles.shell}>
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
            <Button className={styles.selectedStage} size="lg" disabled={!ready} aria-label={`현재 스테이지 ${currentPractice.stage} 시작`} onClick={startCurrent}>
              <span className={styles.selectedStageCopy}><span>{currentPractice.review ? "복습" : currentPractice.progress ? "이어서 학습" : "스테이지"} {currentPractice.stage} · Lv {learningStages[currentPractice.stage - 1].level}</span><strong>{learningStages[currentPractice.stage - 1].name}</strong></span>
              <PlayIcon data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
        <section className={styles.stageSection} aria-labelledby="level-title">
          <h2 id="level-title" className={styles.sectionTitle}>학습 단계</h2>
          <ScrollArea className={styles.stageScroll} viewportProps={{ ref: stageScrollRef, role: "region", "aria-label": "학습 단계 목록", tabIndex: -1 }}>
          <div className={styles.pathInset}>
          <ToggleGroup type="single" orientation="vertical" variant="path" value={String(stage)} aria-labelledby="level-title" className="w-full" onValueChange={value => {
            const selected = Number(value);
            if (Number.isInteger(selected) && selected >= 1 && selected <= learningStages.length) setStage(selected);
          }}>
          <ol className={styles.levelPath} aria-labelledby="level-title">
            {learningStages.map(({ stage: number, level: methodLevel, name }, index) => {
              const offset = pathOffsets[index % pathOffsets.length];
              const nextOffset = pathOffsets[(index + 1) % pathOffsets.length];
              const completed = completedStages.includes(number);
              const MethodIcon = completed ? Check : methodIcons[methodLevel - 1];
              return (
                <li className={styles.levelItem} key={number} data-band={pathBands[Math.floor(index / 4)]} style={{ "--path-offset": offset } as CSSProperties}>
                  {index < learningStages.length - 1 ? <svg className={styles.connector} aria-hidden="true" viewBox="0 0 2 100" preserveAspectRatio="none">
                    <line x1={offset} y1="0" x2={nextOffset} y2="100" vectorEffect="non-scaling-stroke" />
                  </svg> : null}
                  <Popover open={previewStage === number} onOpenChange={open => {
                    setPreviewStage(open ? number : null);
                    if (open) setStage(number);
                  }}>
                  <PopoverTrigger asChild>
                  <ToggleGroupItem value={String(number)} className={styles.levelButton} disabled={!ready}
                    aria-label={`${number} ${name} Lv ${methodLevel}${completed ? " · 완료" : ""}`} data-completed={completed}>
                    <span className={styles.levelNode}><MethodIcon aria-hidden="true" /><Badge variant="stage" className={styles.stageNumber}>{number}</Badge></span>
                    <span className={styles.levelLabel}><Badge variant="secondary">Lv {methodLevel}</Badge><strong className={styles.levelName}>{name}</strong></span>
                  </ToggleGroupItem>
                  </PopoverTrigger>
                  <PopoverContent variant="primary" className={styles.stagePreview} side={compactLandscape ? "left" : "bottom"} sideOffset={14} collisionPadding={20} hideWhenDetached
                    aria-labelledby={`stage-${number}-title`} aria-describedby={`stage-${number}-description`}>
                    <PopoverArrow />
                    <ScrollArea className={styles.previewScroll} viewportProps={{ role: "region", "aria-label": "스테이지 안내", tabIndex: 0 }}>
                    <div className={styles.previewBody}>
                    <PopoverHeader>
                      <div className={styles.previewHeading}>
                        <PopoverTitle id={`stage-${number}-title`} role="heading" aria-level={3}>{name}</PopoverTitle>
                        <Button type="button" variant="ghost-inverse" size="icon" aria-label="스테이지 안내 닫기" onClick={() => setPreviewStage(null)}><CloseIcon /></Button>
                      </div>
                      <PopoverDescription tone="metadata">스테이지 {number} · Lv {methodLevel}</PopoverDescription>
                    </PopoverHeader>
                    <PopoverDescription id={`stage-${number}-description`}>{learningInstructions[methodLevel - 1]}</PopoverDescription>
                    </div>
                    </ScrollArea>
                    <div className={styles.previewActions}>
                      <Button type="button" variant="inverse" size="icon-lg" aria-label="세션 설정" disabled={!ready} onClick={() => {
                        router.push(`${browseHref("session", { language, lessonId: lesson.id })}&stage=${number}&level=${methodLevel}`, { scroll: false });
                      }}><GearIcon /></Button>
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
