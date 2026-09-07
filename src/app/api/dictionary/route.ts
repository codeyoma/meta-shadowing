import { NextResponse } from "next/server";
import { parseDictionaryLanguage, parseDictionaryWord } from "@/lib/dictionary";
import { lookupDictionaryEntries } from "@/lib/dictionary-repository";
import { hasLearnerAccess } from "@/lib/server-auth";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  try {
    if (!(await hasLearnerAccess())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
    }
    const params = new URL(request.url).searchParams;
    const language = parseDictionaryLanguage(params.get("language"));
    const word = parseDictionaryWord(params.get("word"));
    if (!language || !word || params.getAll("language").length !== 1 || params.getAll("word").length !== 1) {
      return NextResponse.json({ error: "invalid-dictionary-query" }, { status: 400, headers: privateHeaders });
    }
    const entries = await lookupDictionaryEntries(language, word);
    return NextResponse.json({ word, entries }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "dictionary-unavailable" }, { status: 503, headers: privateHeaders });
  }
}
