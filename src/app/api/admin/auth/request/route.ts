import { NextResponse } from "next/server";
import { readAdminTestEnvironment } from "@/lib/admin-test-mode";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ sent: false }, { status: 400, headers: noStoreHeaders });
  }

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return NextResponse.json({ sent: false }, { status: 400, headers: noStoreHeaders });
  }

  const testEnvironment = readAdminTestEnvironment();
  if (testEnvironment) {
    const sent = email === testEnvironment.email.toLowerCase();
    return NextResponse.json({ sent }, { status: sent ? 200 : 403, headers: noStoreHeaders });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ sent: false }, { status: 503, headers: noStoreHeaders });
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: new URL("/auth/confirm", request.url).toString()
    }
  });

  return NextResponse.json(
    { sent: !error },
    { status: error ? 400 : 200, headers: noStoreHeaders }
  );
}
