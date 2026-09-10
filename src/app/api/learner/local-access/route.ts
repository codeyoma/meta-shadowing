import { hasBetaAccess } from "@/lib/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const reply = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  if (!await hasBetaAccess()) return reply({ error: "unauthorized" }, 401);
  try {
    const client = await createServerSupabaseClient();
    if (!client) return reply({ error: "unavailable" }, 503);
    // A fresh Auth server response is required to establish/revalidate local access.
    const { data, error } = await client.auth.getUser();
    if (error) return reply({ error: "authentication-failed" }, error.status && error.status >= 400 && error.status < 500 && error.status !== 429 ? 401 : 503);
    const user = data.user, metadata = user?.app_metadata;
    const google = metadata?.provider === "google" || (Array.isArray(metadata?.providers) && metadata.providers.includes("google"));
    if (!user?.id || !user.email || user.is_anonymous || user.role !== "authenticated" || !google) return reply({ error: "unauthorized" }, 403);
    return reply({ accountId: user.id }, 200);
  } catch { return reply({ error: "unavailable" }, 503); }
}
