import { getPublishedAudioDescriptor, UnverifiedPublicationError } from "@/lib/published-audio-descriptor";
import { getGoogleLearnerIdentity, hasBetaAccess } from "@/lib/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await hasBetaAccess() ? await getGoogleLearnerIdentity() : null;
  if (!identity) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  // Acquisition is online: check the Auth server, including deleted/rejected
  // accounts, instead of relying on a locally valid access-token signature alone.
  const client = await createServerSupabaseClient();
  const verified = await client?.auth.getUser();
  const user = verified?.data.user;
  const metadata = user?.app_metadata;
  const hasGoogle = metadata?.provider === "google" || (Array.isArray(metadata?.providers) && metadata.providers.includes("google"));
  if (!verified || verified.error || user?.id !== identity.id || user.is_anonymous === true || !hasGoogle) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const { id } = await context.params;
  const version = new URL(request.url).searchParams.get("version");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !version || !Number.isFinite(Date.parse(version))) {
    return Response.json({ error: "publication-not-found" }, { status: 404, headers });
  }
  try {
    const descriptor = await getPublishedAudioDescriptor(id, version);
    return descriptor ? Response.json(descriptor, { headers })
      : Response.json({ error: "publication-not-found" }, { status: 404, headers });
  } catch (error) {
    return Response.json({ error: error instanceof UnverifiedPublicationError ? "publication-requires-replacement" : "publication-unavailable" },
      { status: error instanceof UnverifiedPublicationError ? 409 : 503, headers });
  }
}
