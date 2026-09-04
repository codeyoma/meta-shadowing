import { NextResponse } from "next/server";
import { ADMIN_TEST_COOKIE_NAME, readAdminTestEnvironment } from "@/lib/admin-test-mode";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  const response = NextResponse.json(
    { authenticated: false },
    { headers: { "Cache-Control": "private, no-store" } }
  );

  if (readAdminTestEnvironment()) {
    response.cookies.delete(ADMIN_TEST_COOKIE_NAME);
    return response;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ authenticated: false }, { status: 503 });
  await supabase.auth.signOut();
  return response;
}
