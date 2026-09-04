import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const otpTypes = new Set<EmailOtpType>(["email", "magiclink"]);

function noStoreRedirect(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const code = request.nextUrl.searchParams.get("code");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const destination = request.nextUrl.clone();
  destination.pathname = "/admin";
  destination.search = "";

  const supabase = await createServerSupabaseClient();
  if (!supabase || (!code && (!tokenHash || !type || !otpTypes.has(type)))) {
    destination.searchParams.set("error", "invalid-link");
    return noStoreRedirect(destination);
  }

  const verification = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  const { data } = verification.error ? { data: null } : await supabase.auth.getClaims();
  if (verification.error || data?.claims.app_metadata?.role !== "admin") {
    await supabase.auth.signOut();
    destination.searchParams.set("error", "invalid-link");
  }

  return noStoreRedirect(destination);
}
