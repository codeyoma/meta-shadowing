import { getAdminIdentity } from "@/lib/admin-auth";
import { AdminPortal } from "./portal";
import { listManagedLessons } from "@/lib/lesson-management";
import { redirect } from "next/navigation";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ replace?: string }> }) {
  const admin = await getAdminIdentity();
  const { replace } = await searchParams;
  const replacement = admin && replace ? (await listManagedLessons(admin, replace))[0] : undefined;
  if (admin && replace && (!replacement || replacement.status === "deleting" || replacement.versionCount === 0)) redirect("/admin/lessons");
  return <AdminPortal initialAdmin={admin} replacement={replacement} />;
}
