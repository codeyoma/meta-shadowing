import { requireLearner } from "@/lib/server-auth";
import { SessionSetup } from "./session-setup";

export default async function SetupPage() {
  await requireLearner();
  return <SessionSetup />;
}
