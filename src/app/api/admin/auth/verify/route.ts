import { NextResponse } from "next/server";
import { createLearnerCookie, LEARNER_SESSION_MS } from "@/lib/auth";
import { ADMIN_TEST_COOKIE_NAME, readAdminTestEnvironment } from "@/lib/admin-test-mode";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let email = "";
  let token = "";
  try {
    const body = (await request.json()) as { email?: unknown; token?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 400, headers: noStoreHeaders });
  }

  const testEnvironment = readAdminTestEnvironment();
  if (testEnvironment) {
    const authenticated =
      email === testEnvironment.email.toLowerCase() && token === testEnvironment.otp;
    if (!authenticated) {
      return NextResponse.json({ authenticated: false }, { status: 401, headers: noStoreHeaders });
    }

    const response = NextResponse.json({ authenticated: true }, { headers: noStoreHeaders });
    response.cookies.set({
      name: ADMIN_TEST_COOKIE_NAME,
      value: createLearnerCookie(testEnvironment.secret),
      httpOnly: true,
      maxAge: LEARNER_SESSION_MS / 1_000,
      path: "/",
      sameSite: "lax",
      secure: false
    });
    return response;
  }

  if (!email || !/^\d{6,8}$/.test(token)) {
    return NextResponse.json({ authenticated: false }, { status: 400, headers: noStoreHeaders });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ authenticated: false }, { status: 503, headers: noStoreHeaders });
  }

  const verification = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (verification.error) {
    return NextResponse.json({ authenticated: false }, { status: 401, headers: noStoreHeaders });
  }

  const { data } = await supabase.auth.getClaims();
  if (data?.claims.app_metadata?.role !== "admin") {
    await supabase.auth.signOut();
    return NextResponse.json({ authenticated: false }, { status: 403, headers: noStoreHeaders });
  }

  return NextResponse.json({ authenticated: true }, { headers: noStoreHeaders });
}
