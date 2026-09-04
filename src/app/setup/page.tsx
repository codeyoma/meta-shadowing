import { requireLearner } from "@/lib/server-auth";
import { SessionSetup } from "../ui";

export default async function SetupPage() {
  await requireLearner();
  return <SessionSetup />;
}
