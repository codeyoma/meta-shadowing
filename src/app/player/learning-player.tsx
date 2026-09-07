"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import type { RapidLine } from "@/lib/rapid-session";
import { groupLessonPhrases } from "@/lib/phrase-groups";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { createRunId } from "@/lib/run-id";
import { browseHref } from "@/lib/browse-navigation";
import { matchesRun, reconcileLearningJournal } from "@/lib/learning-records";
import { readSessionPreferences, resolveSessionSettings, type SessionSettings } from "@/lib/session-settings";
import { Brand, Page } from "../ui";
import { CompletionSummary } from "../completion-summary";
import { AudioPhrasePlayer } from "./audio-phrase-player";
import { RapidPlayer } from "./rapid-player";
import type { LearningStart } from "./use-learning-record";
import { VersionNotice } from "../version-notice";
import styles from "./practice.module.css";

export function LearningPlayer({ lesson, level, stage, hints, lines, defaults, overrides, requestedRun }: {
  lesson: PublishedLesson; level: number; stage: number; hints: SubtitleHint[]; lines: RapidLine[];
  defaults: SessionSettings; overrides: Partial<SessionSettings>; requestedRun?: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState<LearningStart | null>(null);
  const [versionReset, setVersionReset] = useState<{ storageFailed: boolean } | null>(null);
  useEffect(() => {
    const settings = resolveSessionSettings(overrides, readSessionPreferences(defaults));
    // Keep the run identity through refresh without restarting playback or losing mobile activation.
    const existingRun = new URL(window.location.href).searchParams.get("run") ?? requestedRun;
    const selection = { ...settings, language: lesson.language, lessonId: lesson.id, level, stage, runId: existingRun || createRunId() };
    const journal = reconcileLearningJournal([lesson]);
    const saved = journal.progress?.runId === selection.runId ? journal.progress : null;
    const finished = journal.history.find(record => record.runId === selection.runId) ?? null;
    const unitCount = level === 4 || level === 5 ? groupLessonPhrases(lesson.entries, settings.groupSize).length : lesson.phraseCount;
    const progress = saved && matchesRun(saved, lesson, selection) && saved.nextUnit < unitCount && saved.nextPhrase < lesson.phraseCount ? saved : null;
    const completion = finished && matchesRun(finished, lesson, selection) ? finished : null;
    if (journal.resetLessonId || (finished && finished.lessonVersion !== lesson.version)) {
      setVersionReset({ storageFailed: journal.storageFailed });
    }
    if (journal.resetLessonId || (saved && !progress) || (finished && !completion)) selection.runId = createRunId();
    saveLastSelection(selection);
    window.history.replaceState(null, "", getPlayerHref(selection));
    setStart({ selection, progress, completion });
  }, [defaults, lesson, level, stage, overrides, requestedRun]);

  if (!start) return <Page className={styles.loadingPage}><Brand /><ScrollArea className="flex-1"><div className={styles.loadingShell} role="status"><p>학습을 준비하고 있습니다.</p><div aria-hidden="true" className={styles.loadingBlocks}><Skeleton className="h-4 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-14 w-full" /></div></div></ScrollArea></Page>;
  if (start.completion) return <Page className={styles.loadingPage}><Brand /><ScrollArea className="flex-1" viewportProps={{ role: "region", "aria-label": "학습 완료 기록" }}><section className={styles.loadingShell}>
    <h1>메타쉐도잉 레벨 {level}</h1>
    <CompletionSummary record={start.completion} onHome={() => router.push(browseHref("lessons", { language: lesson.language, lessonId: lesson.id }))} />
  </section></ScrollArea></Page>;
  const settings = start.selection;
  const groups = level === 4 || level === 5 ? groupLessonPhrases(lesson.entries, settings.groupSize) : [];
  const notice = versionReset ? <VersionNotice storageFailed={versionReset.storageFailed} /> : null;
  return <>
    {level === 6 || level === 7 || level === 8
      ? <RapidPlayer lesson={lesson} lines={lines} level={level} settings={settings} start={start} notice={notice} />
      : <AudioPhrasePlayer lesson={lesson} level={level === 2 || level === 3 || level === 4 || level === 5 ? level : 1} hints={hints} groups={groups}
        settings={{ mode: settings.mode, playbackRate: settings.speed, advanceDelayMs: settings.advanceDelayMs, groupGapMs: settings.groupGapMs }} start={start} notice={notice} />}
  </>;
}
