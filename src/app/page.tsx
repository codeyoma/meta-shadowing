import { redirect } from "next/navigation";
import { hasBetaAccess } from "@/lib/server-auth";
import { EntryForm } from "./entry-form";

export default async function EntryPage() {
  if (await hasBetaAccess()) redirect("/login");

  return <EntryForm />;
}
