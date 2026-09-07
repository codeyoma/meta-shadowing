import { requireLearner } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; language?: string; lesson?: string }> }) {
  await requireLearner();
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.language === "english" || query.language === "japanese") params.set("language", query.language);
  if (query.lesson) params.set("lesson", query.lesson);
  redirect(`/${query.tab === "lessons" ? "lessons" : "languages"}${params.size ? `?${params}` : ""}`);
}
