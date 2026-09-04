import { requireLearner } from "@/lib/server-auth";
import { LearnerHome } from "./learner-home";

export default async function HomePage() {
  await requireLearner();
  return <LearnerHome />;
}
