import type { Page } from "@playwright/test";
import type { AuthSession, SupabaseClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const COOKIE_CHUNK_SIZE = 3_180;

export function assertLocalSupabaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("Google learner integration fixtures may only use the local Supabase stack.");
  }
  return url;
}

export async function promoteLocalSessionToGoogle(
  supabaseUrl: string,
  serviceClient: SupabaseClient,
  authenticatedClient: SupabaseClient,
  userId: string,
  applicationRole: "admin" | "learner"
): Promise<AuthSession> {
  assertLocalSupabaseUrl(supabaseUrl);

  const updated = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: { role: applicationRole, provider: "google", providers: ["google"] }
  });
  if (updated.error) throw updated.error;

  // The local fixture signs in through email OTP, which mints `provider=email`.
  // Refresh only after the trusted Admin API update so the browser receives the
  // same server-controlled Google claims that production OAuth would mint.
  const refreshed = await authenticatedClient.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) {
    throw refreshed.error ?? new Error("Local Supabase did not refresh the Google fixture session.");
  }

  const verified = await authenticatedClient.auth.getClaims();
  const claims = verified.data?.claims;
  const metadata = claims?.app_metadata;
  if (verified.error || !claims || claims.sub !== userId || metadata?.role !== applicationRole ||
      metadata?.provider !== "google" || !Array.isArray(metadata.providers) ||
      !metadata.providers.includes("google")) {
    throw verified.error ?? new Error("Local Supabase did not persist trusted Google claims in the refreshed JWT.");
  }
  return refreshed.data.session;
}

export async function installLocalSupabaseSession(
  page: Page,
  supabaseUrl: string,
  session: AuthSession
): Promise<void> {
  const supabase = assertLocalSupabaseUrl(supabaseUrl);
  const storageKey = `sb-${supabase.hostname.split(".")[0]}-auth-token`;
  const context = page.context();
  const existing = (await context.cookies()).find((cookie) =>
    cookie.name === storageKey || cookie.name.startsWith(`${storageKey}.`)
  );
  if (!existing) {
    throw new Error("Expected the browser's real local Supabase session cookie before replacing it.");
  }

  const escapedStorageKey = storageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await context.clearCookies({ name: new RegExp(`^${escapedStorageKey}(?:\\.\\d+)?$`) });

  const value = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = value.length <= COOKIE_CHUNK_SIZE
    ? [{ name: storageKey, value }]
    : Array.from({ length: Math.ceil(value.length / COOKIE_CHUNK_SIZE) }, (_, index) => ({
        name: `${storageKey}.${index}`,
        value: value.slice(index * COOKIE_CHUNK_SIZE, (index + 1) * COOKIE_CHUNK_SIZE)
      }));

  await context.addCookies(chunks.map((chunk) => ({
    ...chunk,
    domain: existing.domain,
    path: existing.path,
    expires: session.expires_at ?? Math.floor(Date.now() / 1_000) + session.expires_in,
    httpOnly: false,
    secure: existing.secure,
    sameSite: existing.sameSite
  })));
}
