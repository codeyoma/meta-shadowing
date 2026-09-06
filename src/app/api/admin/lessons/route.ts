import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/admin-auth";
import { listManagedLessons } from "@/lib/lesson-management";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    return NextResponse.json({ lessons: await listManagedLessons(admin) }, { headers });
  } catch {
    return NextResponse.json({ error: "레슨 목록을 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 503, headers });
  }
}
