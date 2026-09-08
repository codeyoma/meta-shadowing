import { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/", "/login", "/languages", "/lessons/:path*", "/settings/:path*",
    "/player", "/home", "/setup", "/api/lessons/:path*", "/api/dictionary",
    "/admin/:path*", "/api/admin/:path*", "/auth/:path*"
  ]
};
