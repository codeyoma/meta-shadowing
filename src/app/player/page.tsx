import { requireLearner } from "@/lib/server-auth";
import { PlayerShell } from "../ui";

export default async function PlayerPage() {
  await requireLearner();
  return <PlayerShell />;
}
