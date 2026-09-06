"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublishedLesson } from "@/lib/lessons";
import type { SubtitleHint } from "@/lib/practice-tokens";
import type { RapidLine } from "@/lib/rapid-session";
import { groupLessonPhrases } from "@/lib/phrase-groups";
import { getPlayerHref, saveLastSelection } from "@/lib/resume";
import { matchesRun, readLearningJournal } from "@/lib/learning-records";
import { readSessionPreferences, resolveSessionSettings, type SessionSettings } from "@/lib/session-settings";
import { Brand, Page } from "../ui";
import { CompletionSummary } from "../completion-summary";
import { AudioPhrasePlayer } from "./audio-phrase-player";
import { RapidPlayer } from "./rapid-player";
import type { LearningStart } from "./use-learning-record";

export function LearningPlayer({ lesson, level, hints, lines, defaults, overrides, requestedRun }: {
  lesson: PublishedLesson; level: number; hints: SubtitleHint[]; lines: RapidLine[];
  defaults: SessionSettings; overrides: Partial<SessionSettings>; requestedRun?: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState<LearningStart | null>(null);
  useEffect(() => {
    const settings = resolveSessionSettings(overrides, readSessionPreferences(defaults));
    // Keep the run identity through refresh without restarting playback or losing mobile activation.
    const existingRun = requestedRun ?? new URL(window.location.href).searchParams.get("run");
    const selection = { ...settings, language: lesson.language, lessonId: lesson.id, level, runId: existingRun || crypto.randomUUID() };
    const journal = readLearningJournal();
    const saved = journal.progress?.runId === selection.runId ? journal.progress : null;
    const finished = journal.history.find(record => record.runId === selection.runId) ?? null;
    const unitCount = level === 4 || level === 5 ? groupLessonPhrases(lesson.entries, settings.groupSize).length : lesson.phraseCount;
    const progress = saved && matchesRun(saved, lesson, selection) && saved.nextUnit < unitCount && saved.nextPhrase < lesson.phraseCount ? saved : null;
    const completion = finished && matchesRun(finished, lesson, selection) ? finished : null;
    if ((saved && !progress) || (finished && !completion)) selection.runId = crypto.randomUUID();
    saveLastSelection(selection);
    window.history.replaceState(null, "", getPlayerHref(selection));
    setStart({ selection, progress, completion });
  }, [defaults, lesson, level, overrides, requestedRun]);

  if (!start) return <Page className="player-page"><Brand /><p role="status">학습을 준비하고 있습니다.</p></Page>;
  if (start.completion) return <Page className="player-page"><Brand /><section className="practice-shell">
    <h1>메타쉐도잉 레벨 {level}</h1>
    <CompletionSummary record={start.completion} onHome={() => router.push("/home")} />
  </section></Page>;
  const settings = start.selection;
  if (level === 6 || level === 7 || level === 8) return <RapidPlayer lesson={lesson} lines={lines} level={level} settings={settings} start={start} />;
  const groups = level === 4 || level === 5 ? groupLessonPhrases(lesson.entries, settings.groupSize) : [];
  return <AudioPhrasePlayer lesson={lesson} level={level === 2 || level === 3 || level === 4 || level === 5 ? level : 1} hints={hints} groups={groups}
    settings={{ mode: settings.mode, playbackRate: settings.speed, advanceDelayMs: settings.advanceDelayMs, groupGapMs: settings.groupGapMs }} start={start} />;
}
