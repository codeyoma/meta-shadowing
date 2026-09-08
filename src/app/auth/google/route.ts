import { NextResponse } from "next/server";
import { hasBetaAccess } from "@/lib/server-auth";
import { authNoStoreHeaders, learnerAuthRedirect, sameOrigin } from "@/lib/learner-auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = sameOrigin(request);
  if (!origin) return NextResponse.json({ error: "invalid-origin" }, { status: 403, headers: authNoStoreHeaders });
  if (!(await hasBetaAccess())) return learnerAuthRedirect("/");

  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true }
      });
      if (!error && data.url) return NextResponse.redirect(data.url, { status: 303, headers: authNoStoreHeaders });
    }
  } catch {
    // Do not expose provider responses or credentials in the login URL.
  }
  return learnerAuthRedirect("/login?error=unavailable");
}
