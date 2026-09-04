import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { SessionSetup } from "./session-setup";

type SetupPageProps = { searchParams: Promise<{ lesson?: string }> };

export default async function SetupPage({ searchParams }: SetupPageProps) {
  await requireLearner();
  const { lesson: lessonId } = await searchParams;
  const lesson = await getPublishedLesson(lessonId ?? null);
  if (!lesson) redirect("/home");
  return <SessionSetup lesson={lesson} />;
}
