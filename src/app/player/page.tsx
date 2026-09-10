import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { firstPracticeToken } from "@/lib/practice-tokens";
import { prepareRapidLines } from "@/lib/rapid-lines";
import { stageForLevel } from "@/lib/learning-stages";
import { cloudLearningEnabled } from "@/lib/cloud-learning";
import { PackageLearningPlayer } from "./package-learning-player";

import { CloudLearningUnavailable } from "../cloud-learning-unavailable";

type PlayerPageProps = { searchParams: Promise<Record<string, string | undefined>> };

export default async function PlayerPage({ searchParams }: PlayerPageProps) {
  const identity = await requireLearner();
  if (!cloudLearningEnabled()) return <CloudLearningUnavailable />;
  const params = await searchParams;
  const lesson = await getPublishedLesson(params.lesson ?? null);
  if (!lesson) redirect("/home");
  const requestedLevel = Number(params.level);
  const level = Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 8 ? requestedLevel : 1;
  const stage = stageForLevel(level, Number(params.stage));
  // Segment on the server so browser ICU versions cannot change first-token hints or rapid tokens.
  const hints = level === 3 || level === 5 ? lesson.phrases.map(phrase => ({
    target: firstPracticeToken(phrase.target, lesson.language), korean: firstPracticeToken(phrase.korean, "korean")
  })) : [];
  return <PackageLearningPlayer key={`${identity.id}:${lesson.id}:${lesson.version}:${stage}`} accountId={identity.id} lesson={lesson} level={level as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8} stage={stage} hints={hints}
      lines={level >= 6 ? prepareRapidLines(lesson.entries,lesson.language) : []} requestedRun={params.run} />;
}
