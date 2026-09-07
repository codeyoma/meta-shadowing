import { NextResponse } from "next/server";
import { authorizeAdminMutation } from "@/lib/admin-auth";
import { DraftRequestError, readLessonDraftImport } from "@/lib/admin-draft-request";
import { saveLessonDraft } from "@/lib/lesson-draft-repository";
import { prepareSentenceSyntax } from "@/lib/sentence-syntax-repository";

export async function POST(request: Request) {
  const admin = await authorizeAdminMutation(request);
  if (admin instanceof Response) return admin;

  try {
    const draft = await readLessonDraftImport(request);
    const draftId = await saveLessonDraft(admin, draft);
    // Do not lose a successfully saved draft if the analysis store is temporarily
    // unavailable. Its status endpoint can idempotently initialize missing jobs.
    let syntaxWarning: string | undefined;
    try { await prepareSentenceSyntax(admin, draftId); }
    catch { syntaxWarning = "초안은 저장했지만 구문 분석 준비에 실패했습니다. 아래 분석 상태에서 다시 시도해 주세요."; }
    return NextResponse.json(
      { draftId, result: draft.parseResult, syntaxWarning },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status = error instanceof DraftRequestError ? error.status : 500;
    const message = error instanceof DraftRequestError ? error.message : "초안을 저장하지 못했습니다.";
    return NextResponse.json({ error: message }, { status });
  }
}
