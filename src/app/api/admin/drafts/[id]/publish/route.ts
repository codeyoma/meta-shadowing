import { NextResponse } from "next/server";
import { getAdminIdentity, hasTrustedAdminOrigin } from "@/lib/admin-auth";
import { LessonPublicationError, publishLessonDraft } from "@/lib/lesson-publication";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasTrustedAdminOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403 });

  try {
    const { id } = await context.params;
    const publication = await publishLessonDraft(admin, id);
    return NextResponse.json(publication, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    if (error instanceof LessonPublicationError) {
      return NextResponse.json(
        { error: error.code, message: error.message, result: error.result },
        { status: error.status, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    return NextResponse.json(
      { error: "publish-failed", message: "레슨을 게시하지 못했습니다." },
      { status: 500 }
    );
  }
}
