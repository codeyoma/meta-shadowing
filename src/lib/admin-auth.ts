import "server-only";

import { cookies } from "next/headers";
import { verifyLearnerCookie } from "./auth";
import { ADMIN_TEST_COOKIE_NAME, readAdminTestEnvironment } from "./admin-test-mode";
import { createServerSupabaseClient } from "./supabase/server";

export type AdminIdentity = {
  id: string;
  email: string;
};

export function hasTrustedAdminOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still require administrator authentication.
  try {
    const url = new URL(origin);
    // Compare the browser-facing Host, not Next's internal bind URL behind a proxy.
    return ["http:", "https:"].includes(url.protocol) && url.host === request.headers.get("host");
  } catch { return false; }
}

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const testEnvironment = readAdminTestEnvironment();
  if (testEnvironment) {
    const cookie = (await cookies()).get(ADMIN_TEST_COOKIE_NAME)?.value;
    return verifyLearnerCookie(cookie, testEnvironment.secret)
      ? { id: "00000000-0000-4000-8000-000000000003", email: testEnvironment.email }
      : null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || claims.app_metadata?.role !== "admin" || !claims.email) return null;

  return { id: claims.sub, email: claims.email };
}
