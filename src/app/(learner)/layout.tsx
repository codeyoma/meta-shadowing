import { Suspense, type ReactNode } from "react";
import { requireLearner } from "@/lib/server-auth";
import { cloudLearningEnabled } from "@/lib/cloud-learning";
import { listPublishedLessons } from "@/lib/published-lessons";
import { BrowseShell } from "../browse-shell";
import { CloudLearningUnavailable } from "../cloud-learning-unavailable";

export default async function LearnerLayout({ children }: { children: ReactNode }) {
  const identity = await requireLearner();
  if (!cloudLearningEnabled()) return <CloudLearningUnavailable />;
  const catalog = await listPublishedLessons();
  return <Suspense fallback={<main className="page" aria-busy="true"><p role="status">불러오는 중…</p></main>}>
    <BrowseShell catalog={catalog} accountId={identity.id} profile={identity.profile}>{children}</BrowseShell>
  </Suspense>;
}
