import { NextResponse } from "next/server";
import { authorizeAdminMutation } from "@/lib/admin-auth";
import { LessonPublicationError, publishLessonDraft } from "@/lib/lesson-publication";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const admin = await authorizeAdminMutation(request);
  if (admin instanceof Response) return admin;
  const started = Date.now();
  console.info(JSON.stringify({ event: "lesson-publication-start" }));

  try {
    const { id } = await context.params;
    const publication = await publishLessonDraft(admin, id);
    console.info(JSON.stringify({ event: "lesson-publication-complete", phrases: publication.result.items.length, durationMs: Date.now() - started }));
    return NextResponse.json(publication, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "lesson-publication-failed", code: error instanceof LessonPublicationError ? error.code : "unexpected", durationMs: Date.now() - started }));
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
