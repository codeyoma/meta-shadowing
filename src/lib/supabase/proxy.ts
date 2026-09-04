import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { readSupabasePublicEnvironment } from "./config";

export async function updateSupabaseSession(request: NextRequest) {
  const environment = readSupabasePublicEnvironment();
  if (!environment) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(environment.url, environment.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      }
    }
  });

  await supabase.auth.getClaims();
  return response;
}
