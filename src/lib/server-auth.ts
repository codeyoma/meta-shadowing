import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LEARNER_COOKIE_NAME, verifyLearnerCookie } from "./auth";
import { createServerSupabaseClient } from "./supabase/server";

export function readAuthEnvironment(): { password: string; secret: string } | null {
  const password = process.env.BETA_PASSWORD;
  const secret = process.env.LEARNER_COOKIE_SECRET;
  return password && secret ? { password, secret } : null;
}

export async function requireLearner(): Promise<void> {
  if (!(await hasBetaAccess())) redirect("/");
  if (!(await getGoogleLearnerIdentity())) redirect("/login");
}

// The existing learner cookie is an invitation pass, not a user session.
export async function hasBetaAccess(): Promise<boolean> {
  const config = readAuthEnvironment();
  const cookie = (await cookies()).get(LEARNER_COOKIE_NAME)?.value;
  return Boolean(config && verifyLearnerCookie(cookie, config.secret));
}

export async function getGoogleLearnerIdentity(): Promise<{ id: string; email: string } | null> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    const metadata = claims?.app_metadata;
    // Only verified, server-controlled metadata can establish a Google identity.
    const hasGoogle = metadata?.provider === "google"
      || (Array.isArray(metadata?.providers) && metadata.providers.includes("google"));
    if (error || !claims || !hasGoogle || claims.is_anonymous === true
      || claims.role !== "authenticated" || typeof claims.sub !== "string" || !claims.sub
      || typeof claims.email !== "string" || !claims.email) return null;
    return { id: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}

export async function hasLearnerAccess(): Promise<boolean> {
  return await hasBetaAccess() && Boolean(await getGoogleLearnerIdentity());
}
