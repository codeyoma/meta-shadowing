import { requireLearner } from "@/lib/server-auth";
import { listPublishedLessons } from "@/lib/published-lessons";
import { LearnerHome } from "./learner-home";

export default async function HomePage() {
  await requireLearner();
  const catalog = await listPublishedLessons();
  return <LearnerHome catalog={catalog} />;
}
