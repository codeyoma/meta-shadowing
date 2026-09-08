import { hasBetaAccess, getGoogleLearnerIdentity } from "@/lib/server-auth";
import { learnerAuthRedirect } from "@/lib/learner-auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await hasBetaAccess())) return learnerAuthRedirect("/");
  const params = new URL(request.url).searchParams;
  if (params.has("error")) return learnerAuthRedirect("/login?error=cancelled");
  const code = params.get("code");
  const flowId = params.get("sb_flow_id");
  if (!code || code.length > 2048 || params.getAll("code").length !== 1
    || params.getAll("sb_flow_id").length > 1 || (flowId !== null && (!flowId || flowId.length > 256))) {
    return learnerAuthRedirect("/login?error=invalid-session");
  }

  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (!error) {
        if (await getGoogleLearnerIdentity()) return learnerAuthRedirect("/languages");
        // Clear only this newly exchanged, unsupported session, not other devices.
        await supabase.auth.signOut({ scope: "local" });
      }
    }
  } catch {
    // A failed/expired PKCE exchange must never grant learner access.
  }
  return learnerAuthRedirect("/login?error=invalid-session");
}
