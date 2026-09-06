import { redirect } from "next/navigation";
import { getAdminIdentity } from "@/lib/admin-auth";
import { listManagedLessons } from "@/lib/lesson-management";
import { LessonManager } from "./lesson-manager";

export default async function AdminLessonsPage() {
  const admin = await getAdminIdentity();
  if (!admin) redirect("/admin");
  try {
    return <LessonManager initialLessons={await listManagedLessons(admin)} />;
  } catch {
    return <LessonManager initialLessons={[]} initialError="레슨 목록을 불러오지 못했습니다. 새로고침해 주세요." />;
  }
}
