import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabasePublicEnvironment } from "./config";

export async function createServerSupabaseClient() {
  const environment = readSupabasePublicEnvironment();
  if (!environment) return null;

  const cookieStore = await cookies();
  return createServerClient(environment.url, environment.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. src/proxy.ts refreshes them.
        }
      }
    }
  });
}
