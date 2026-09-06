import { NextResponse } from "next/server";
import { getAdminIdentity, hasTrustedAdminOrigin } from "@/lib/admin-auth";
import { unpublishLesson, LessonManagementError } from "@/lib/lesson-management";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  if (!hasTrustedAdminOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403, headers });
  try {
    const { id } = await context.params;
    await unpublishLesson(admin, id);
    return NextResponse.json({ unpublished: true }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LessonManagementError ? error.message : "게시를 해제하지 못했습니다." },
      { status: error instanceof LessonManagementError ? error.status : 503, headers });
  }
}
