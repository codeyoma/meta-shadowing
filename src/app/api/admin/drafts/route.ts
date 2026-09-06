import { NextResponse } from "next/server";
import { getAdminIdentity, hasTrustedAdminOrigin } from "@/lib/admin-auth";
import { DraftRequestError, readLessonDraftImport } from "@/lib/admin-draft-request";
import { saveLessonDraft } from "@/lib/lesson-draft-repository";

export async function POST(request: Request) {
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasTrustedAdminOrigin(request)) return NextResponse.json({ error: "invalid-origin" }, { status: 403 });

  try {
    const draft = await readLessonDraftImport(request);
    const draftId = await saveLessonDraft(admin, draft);
    return NextResponse.json(
      { draftId, result: draft.parseResult },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status = error instanceof DraftRequestError ? error.status : 500;
    const message = error instanceof DraftRequestError ? error.message : "초안을 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status });
  }
}
