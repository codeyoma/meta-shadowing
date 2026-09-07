import { NextResponse } from "next/server";
import { getPublishedPhraseSyntax } from "@/lib/published-syntax";
import { hasLearnerAccess } from "@/lib/server-auth";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request, context: { params: Promise<{ id: string; phraseNumber: string }> }) {
  try {
    if (!(await hasLearnerAccess())) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
    const { id, phraseNumber } = await context.params;
    const query = new URL(request.url).searchParams;
    const version = query.get("version");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !/^[1-9]\d{0,6}$/.test(phraseNumber) || query.getAll("version").length !== 1
      || !version || version.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(version) || !Number.isFinite(Date.parse(version))) {
      return NextResponse.json({ error: "invalid-syntax-query" }, { status: 400, headers: privateHeaders });
    }
    const result = await getPublishedPhraseSyntax(id, Number(phraseNumber), version);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "syntax-unavailable" }, { status: 503, headers: privateHeaders });
  }
}
