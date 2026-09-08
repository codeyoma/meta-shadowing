import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { firstPracticeToken } from "@/lib/practice-tokens";
import { prepareRapidLines } from "@/lib/rapid-lines";
import { validSettingOverrides } from "@/lib/session-settings";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { LearningPlayer } from "./learning-player";
import { stageForLevel } from "@/lib/learning-stages";
import { cloudLearningEnabled } from "@/lib/cloud-learning";
import { CloudLearningPlayer } from "./cloud-learning-player";

type PlayerPageProps = { searchParams: Promise<Record<string, string | undefined>> };

export default async function PlayerPage({ searchParams }: PlayerPageProps) {
  const identity = await requireLearner();
  const params = await searchParams;
  const [lesson, defaults] = await Promise.all([getPublishedLesson(params.lesson ?? null), getSessionDefaults()]);
  if (!lesson) redirect("/home");
  const requestedLevel = Number(params.level);
  const level = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 8 ? requestedLevel : 1;
  const stage = stageForLevel(level, Number(params.stage));
  const milliseconds = (value?: string) => value === undefined ? undefined : Number(value) * 1000;
  const overrides = validSettingOverrides({
    mode: params.mode, display: params.display, speed: Number(params.speed), groupSize: Number(params.group), wpmLevel: Number(params.wpm),
    advanceDelayMs: milliseconds(params.gap), groupGapMs: milliseconds(params.groupGap), speakingExtraMs: milliseconds(params.speak),
    lineGapMs: milliseconds(params.lineGap), sectionGapMs: milliseconds(params.sectionGap)
  });
  // Segment on the server so browser ICU versions cannot change first-token hints or rapid tokens.
  const hints = level === 3 || level === 5 ? lesson.phrases.map(phrase => ({
    target: firstPracticeToken(phrase.target, lesson.language), korean: firstPracticeToken(phrase.korean, "korean")
  })) : [];
  if (cloudLearningEnabled()) {
    return <CloudLearningPlayer key={`${lesson.id}:${lesson.version}:${stage}`} accountId={identity.id} lesson={lesson} level={level as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8} stage={stage} hints={hints}
      lines={level >= 6 ? prepareRapidLines(lesson.entries,lesson.language) : []} requestedRun={params.run} />;
  }
  return <LearningPlayer key={JSON.stringify([lesson.id, lesson.version, level, params])} lesson={lesson} level={level} stage={stage} hints={hints}
    lines={level >= 6 ? prepareRapidLines(lesson.entries, lesson.language) : []} defaults={defaults} overrides={overrides} requestedRun={params.run} />;
}
