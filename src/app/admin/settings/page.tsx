import { redirect } from "next/navigation";
import { getAdminIdentity } from "@/lib/admin-auth";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { DefaultsEditor } from "./defaults-editor";

export default async function AdminSettingsPage() {
  if (!await getAdminIdentity()) redirect("/admin");
  return <DefaultsEditor defaults={await getSessionDefaults()} />;
}
