import { requireLearner } from "@/lib/server-auth";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { SessionPreferencesPage } from "../../../session-preferences-page";

export default async function SessionSettingsPage() {
  await requireLearner();
  return <SessionPreferencesPage defaults={await getSessionDefaults()} />;
}
