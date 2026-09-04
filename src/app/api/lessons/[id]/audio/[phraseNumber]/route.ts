import { NextResponse } from "next/server";
import { createPublishedAudioUrl } from "@/lib/published-lessons";
import { hasLearnerAccess } from "@/lib/server-auth";

type RouteContext = { params: Promise<{ id: string; phraseNumber: string }> };
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: RouteContext) {
  if (!(await hasLearnerAccess())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  }

  const { id, phraseNumber: phraseNumberValue } = await context.params;
  const phraseNumber = Number(phraseNumberValue);
  if (!Number.isInteger(phraseNumber) || phraseNumber < 1) {
    return NextResponse.json({ error: "audio-not-found" }, { status: 404, headers: privateHeaders });
  }

  try {
    const signedUrl = await createPublishedAudioUrl(id, phraseNumber);
    if (!signedUrl) {
      return NextResponse.json({ error: "audio-not-found" }, { status: 404, headers: privateHeaders });
    }
    return NextResponse.redirect(signedUrl, { status: 307, headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: "audio-unavailable" },
      { status: 503, headers: privateHeaders }
    );
  }
}
