import { requireLearner } from "@/lib/server-auth";
import { LearnerHome } from "../ui";

export default async function HomePage() {
  await requireLearner();
  return <LearnerHome />;
}
