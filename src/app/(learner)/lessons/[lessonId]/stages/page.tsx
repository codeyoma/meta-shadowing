import { notFound } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { SessionSetup } from "../../../../setup/session-setup";

export default async function StagesPage({ params, searchParams }: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  await requireLearner();
  const [{ lessonId }, query] = await Promise.all([params, searchParams]);
  const [lesson, defaults] = await Promise.all([getPublishedLesson(lessonId), getSessionDefaults()]);
  if (!lesson) notFound();
  const stage = Number(query.stage);
  return <SessionSetup key={lesson.id} lesson={lesson} defaults={defaults}
    initialStage={Number.isInteger(stage) && stage >= 1 && stage <= 16 ? stage : undefined} />;
}
