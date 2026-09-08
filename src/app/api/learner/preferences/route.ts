import { cloudLearningEnabled } from "@/lib/cloud-learning";
import { getGoogleLearnerIdentity, hasBetaAccess } from "@/lib/server-auth";
import { parsePreferencePatch, studyTimeZone } from "@/lib/learner-preferences";
import { patchLearnerPreferences, readLearnerPreferences } from "@/lib/learner-preferences-repository";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { getPublishedLesson } from "@/lib/published-lessons";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: string, status: number) { return Response.json({ error }, { status, headers }); }
async function authorize(request: Request) {
  if (!cloudLearningEnabled()) return failure("not-found", 404);
  // GET initializes the profile/timezone, so it needs the same origin guard as PATCH.
  const origin = request.headers.get("origin");
  try {
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return failure("invalid-origin", 403);
    if (origin) {
      const source = new URL(origin);
      const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
      if (!["http:", "https:"].includes(source.protocol) || source.protocol !== `${protocol}:` || source.host !== request.headers.get("host")) return failure("invalid-origin", 403);
    }
  } catch { return failure("invalid-origin", 403); }
  if (!await hasBetaAccess()) return failure("unauthorized", 401);
  return await getGoogleLearnerIdentity() ?? failure("unauthorized", 401);
}

export async function GET(request: Request) {
  const identity = await authorize(request);
  if (identity instanceof Response) return identity;
  try {
    const defaults = await getSessionDefaults();
    const profile = await readLearnerPreferences(identity.id, studyTimeZone(new URL(request.url).searchParams.get("timezone")));
    return Response.json({ profile, defaults }, { headers });
  } catch { return failure("preferences-unavailable", 503); }
}

export async function PATCH(request: Request) {
  const identity = await authorize(request);
  if (identity instanceof Response) return identity;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("invalid-content-type", 415);
  const text = await request.text();
  if (text.length > 4096) return failure("patch-too-large", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return failure("invalid-json", 400); }
  const patch = parsePreferencePatch(body);
  if (!patch) return failure("invalid-patch", 400);
  // This is a stale-tab guard, not authorization: ownership always comes from claims.
  if (patch.accountId !== identity.id) return failure("account-changed", 409);
  try {
    const selection = patch.changes.selection;
    if (selection?.lessonId) {
      const lesson = await getPublishedLesson(selection.lessonId);
      if (!lesson || lesson.language !== selection.language) return failure("invalid-selection", 400);
    }
    const defaults = await getSessionDefaults();
    const profile = await patchLearnerPreferences(identity.id, patch);
    return Response.json({ profile, defaults }, { status: profile.conflict ? 409 : 200, headers });
  } catch { return failure("preferences-save-failed", 503); }
}
