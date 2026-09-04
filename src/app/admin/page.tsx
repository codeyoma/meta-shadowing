import { getAdminIdentity } from "@/lib/admin-auth";
import { AdminPortal } from "./portal";

export default async function AdminPage() {
  const admin = await getAdminIdentity();
  return <AdminPortal initialAdmin={admin} />;
}
