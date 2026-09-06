import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { firstPracticeToken } from "@/lib/practice-tokens";
import { groupLessonPhrases } from "@/lib/phrase-groups";
import { PlayerShell } from "./player-shell";

type PlayerPageProps = { searchParams: Promise<{ lesson?: string; level?: string; mode?: string; speed?: string; gap?: string; group?: string }> };

export default async function PlayerPage({ searchParams }: PlayerPageProps) {
  await requireLearner();
  const params = await searchParams;
  const lesson = await getPublishedLesson(params.lesson ?? null);
  if (!lesson) redirect("/home");
  const requestedLevel = Number(params.level);
  const level = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 8 ? requestedLevel : 1;
  // Segment once on the server so browser ICU versions cannot change the initial hints during hydration.
  const hints = level === 3 || level === 5 ? lesson.phrases.map((phrase) => ({
    target: firstPracticeToken(phrase.target, lesson.language),
    korean: firstPracticeToken(phrase.korean, "korean")
  })) : [];
  const requestedGroupSize = Number(params.group);
  const groupSize = requestedGroupSize === 3 || requestedGroupSize === 4 ? requestedGroupSize : 2;
  const groups = level === 4 || level === 5 ? groupLessonPhrases(lesson.entries, groupSize) : [];
  return <PlayerShell lesson={lesson} level={level} hints={hints} groups={groups} settings={{
    mode: params.mode === "automatic" ? "automatic" : "manual",
    playbackRate: Number(params.speed ?? 1),
    advanceDelayMs: Number(params.gap ?? 1) * 1000
  }} />;
}
