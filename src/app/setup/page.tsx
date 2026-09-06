import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { SessionSetup } from "./session-setup";

type SetupPageProps = { searchParams: Promise<{ lesson?: string }> };

export default async function SetupPage({ searchParams }: SetupPageProps) {
  await requireLearner();
  const { lesson: lessonId } = await searchParams;
  const [lesson, defaults] = await Promise.all([getPublishedLesson(lessonId ?? null), getSessionDefaults()]);
  if (!lesson) redirect("/home");
  return <SessionSetup lesson={lesson} defaults={defaults} />;
}
