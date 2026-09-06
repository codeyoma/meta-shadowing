import { NextResponse } from "next/server";
import { getAdminIdentity, hasTrustedAdminOrigin } from "@/lib/admin-auth";
import { deleteLesson, LessonManagementError } from "@/lib/lesson-management";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  if (!hasTrustedAdminOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "invalid-content-type" }, { status: 415, headers });
  try {
    const { id } = await context.params;
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ error: "request-too-large" }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text || "null"); }
    catch { return NextResponse.json({ error: "invalid-json" }, { status: 400, headers }); }
    if (!body || typeof body.confirmTitle !== "string" || body.confirmTitle.length > 120 || typeof body.expectedDraftId !== "string") {
      return NextResponse.json({ error: "삭제할 레슨 제목을 다시 확인해 주세요." }, { status: 400, headers });
    }
    await deleteLesson(admin, id, { title: body.confirmTitle, draftId: body.expectedDraftId });
    return NextResponse.json({ deleted: true }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LessonManagementError ? error.message : "레슨을 삭제하지 못했습니다.",
      retryable: error instanceof LessonManagementError && error.retryable },
    { status: error instanceof LessonManagementError ? error.status : 503, headers });
  }
}
