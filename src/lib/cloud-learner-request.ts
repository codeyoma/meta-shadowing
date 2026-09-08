import "server-only";
import { cloudLearningEnabled } from "./cloud-learning";
import { getGoogleLearnerIdentity, hasBetaAccess } from "./server-auth";

/** Shared access boundary, including GETs that initialize account state. */
export async function authorizeCloudLearner(request: Request) {
  const failure = (error: string, status: number) => Response.json({ error }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  if (!cloudLearningEnabled()) return failure("not-found", 404);
  try {
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return failure("invalid-origin", 403);
    const origin = request.headers.get("origin");
    if (origin) {
      const source = new URL(origin);
      const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
      if (!["http:", "https:"].includes(source.protocol) || source.protocol !== `${protocol}:` || source.host !== request.headers.get("host")) return failure("invalid-origin", 403);
    }
  } catch { return failure("invalid-origin", 403); }
  if (!await hasBetaAccess()) return failure("unauthorized", 401);
  return await getGoogleLearnerIdentity() ?? failure("unauthorized", 401);
}
