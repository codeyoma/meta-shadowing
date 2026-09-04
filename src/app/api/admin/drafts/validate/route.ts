import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/admin-auth";
import { DraftRequestError, readLessonDraftImport } from "@/lib/admin-draft-request";

export async function POST(request: Request) {
  const admin = await getAdminIdentity();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const draft = await readLessonDraftImport(request);
    return NextResponse.json(
      { result: draft.parseResult },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status = error instanceof DraftRequestError ? error.status : 500;
    const message = error instanceof DraftRequestError ? error.message : "파일을 검증하지 못했습니다.";
    return NextResponse.json({ error: message }, { status });
  }
}
