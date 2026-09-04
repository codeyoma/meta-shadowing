import { requireLearner } from "@/lib/server-auth";
import { PlayerShell } from "./player-shell";

export default async function PlayerPage() {
  await requireLearner();
  return <PlayerShell />;
}
