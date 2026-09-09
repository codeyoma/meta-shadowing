import { SettingsPage } from "../../browse-pages";
import { requireLearner } from "@/lib/server-auth";

export default async function Settings() {
  const { profile } = await requireLearner();
  return <SettingsPage profile={profile} />;
}
