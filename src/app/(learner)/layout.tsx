import { Suspense, type ReactNode } from "react";
import { requireLearner } from "@/lib/server-auth";
import { listPublishedLessons } from "@/lib/published-lessons";
import { BrowseShell } from "../browse-shell";

export default async function LearnerLayout({ children }: { children: ReactNode }) {
  await requireLearner();
  const catalog = await listPublishedLessons();
  return <Suspense fallback={<main className="page" aria-busy="true"><p role="status">불러오는 중…</p></main>}>
    <BrowseShell catalog={catalog}>{children}</BrowseShell>
  </Suspense>;
}
