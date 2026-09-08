import { requireLearner } from "@/lib/server-auth";
import { redirect } from "next/navigation";
import { isLanguage } from "@/lib/languages";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; language?: string; lesson?: string }> }) {
  await requireLearner();
  const query = await searchParams;
  const params = new URLSearchParams();
  if (isLanguage(query.language)) params.set("language", query.language);
  if (query.lesson) params.set("lesson", query.lesson);
  redirect(`/${query.tab === "lessons" ? "lessons" : "languages"}${params.size ? `?${params}` : ""}`);
}
