import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { firstPracticeToken } from "@/lib/practice-tokens";
import { groupLessonPhrases, isGroupSize } from "@/lib/phrase-groups";
import { prepareRapidLines } from "@/lib/rapid-lines";
import { isWpmLevel, normalizeRapidSettings } from "@/lib/rapid-session";
import { AudioPhrasePlayer } from "./audio-phrase-player";
import { RapidPlayer } from "./rapid-player";

type PlayerPageProps = { searchParams: Promise<{ lesson?: string; level?: string; mode?: string; speed?: string; gap?: string; group?: string; wpm?: string; display?: string; speak?: string; lineGap?: string; sectionGap?: string }> };

export default async function PlayerPage({ searchParams }: PlayerPageProps) {
  await requireLearner();
  const params = await searchParams;
  const lesson = await getPublishedLesson(params.lesson ?? null);
  if (!lesson) redirect("/home");
  const requestedLevel = Number(params.level);
  const level = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 8 ? requestedLevel : 1;
  if (level === 6 || level === 7 || level === 8) {
    const requestedWpm = Number(params.wpm);
    const settings = normalizeRapidSettings({
      mode: params.mode === "automatic" ? "automatic" : "manual",
      display: params.display === "cumulative" ? "cumulative" : "current",
      wpmLevel: isWpmLevel(requestedWpm) ? requestedWpm : 3,
      speakingExtraMs: Number(params.speak ?? 0.5) * 1000,
      lineGapMs: Number(params.lineGap ?? 1) * 1000,
      sectionGapMs: Number(params.sectionGap ?? 2) * 1000
    });
    const { id, language, name, localizedName, phraseCount } = lesson;
    return <RapidPlayer key={`${id}:${level}:${JSON.stringify(settings)}`} lesson={{ id, language, name, localizedName, phraseCount }} lines={prepareRapidLines(lesson.entries, language)} level={level} settings={settings} />;
  }
  // Segment once on the server so browser ICU versions cannot change the initial hints during hydration.
  const hints = level === 3 || level === 5 ? lesson.phrases.map((phrase) => ({
    target: firstPracticeToken(phrase.target, lesson.language),
    korean: firstPracticeToken(phrase.korean, "korean")
  })) : [];
  const requestedGroupSize = Number(params.group);
  const groupSize = isGroupSize(requestedGroupSize) ? requestedGroupSize : 2;
  const groups = level === 4 || level === 5 ? groupLessonPhrases(lesson.entries, groupSize) : [];
  return <AudioPhrasePlayer key={`${lesson.id}:${level}:${params.mode}:${params.speed}:${params.gap}:${groupSize}`} lesson={lesson} level={level === 2 || level === 3 || level === 4 || level === 5 ? level : 1} hints={hints} groups={groups} settings={{
    mode: params.mode === "automatic" ? "automatic" : "manual",
    playbackRate: Number(params.speed ?? 1),
    advanceDelayMs: Number(params.gap ?? 1) * 1000
  }} />;
}
