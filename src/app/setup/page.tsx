import { redirect } from "next/navigation";
import { getPublishedLesson } from "@/lib/published-lessons";
import { requireLearner } from "@/lib/server-auth";
import { browseHref, stageHref } from "@/lib/browse-navigation";

type SetupPageProps = { searchParams: Promise<{ lesson?: string; panel?: string }> };

export default async function SetupPage({ searchParams }: SetupPageProps) {
  await requireLearner();
  const { lesson: lessonId, panel } = await searchParams;
  const lesson = await getPublishedLesson(lessonId ?? null);
  if (!lesson) redirect("/languages");
  redirect(panel === "settings" ? browseHref("session", { language: lesson.language, lessonId: lesson.id }) : stageHref(lesson.id));
}
