import { getPublishedAudio } from "@/lib/published-lessons";
import { getGoogleLearnerIdentity, hasBetaAccess } from "@/lib/server-auth";
import { getSupportedAudioFormat } from "@/lib/audio-format";

const headers = { "Cache-Control": "private, no-store" };
type RouteContext = { params: Promise<{ id: string; phraseNumber: string }> };

/** Authorizes reuse of audio bytes without downloading or persisting a signed URL. */
export async function GET(request: Request, context: RouteContext) {
  const identity = await hasBetaAccess() ? await getGoogleLearnerIdentity() : null;
  if (!identity) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const { id, phraseNumber: value } = await context.params;
  const phraseNumber = Number(value), version = new URL(request.url).searchParams.get("version");
  if (!version || !Number.isInteger(phraseNumber) || phraseNumber < 1) {
    return Response.json({ error: "audio-not-found" }, { status: 404, headers });
  }
  try {
    const published = await getPublishedAudio(id, phraseNumber, version);
    const format = published && getSupportedAudioFormat(published.audio.canonicalName);
    if (!published || !format) return Response.json({ error: "audio-not-found" }, { status: 404, headers });
    return Response.json({ accountId: identity.id, lessonId: id, version: published.version,
      audioId: published.audio.canonicalName, format: format.extension }, { headers });
  } catch {
    return Response.json({ error: "audio-unavailable" }, { status: 503, headers });
  }
}
