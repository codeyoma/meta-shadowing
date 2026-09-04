"use client";

import { createBrowserClient } from "@supabase/ssr";
import { readSupabasePublicEnvironment } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null | undefined;

export function getBrowserSupabaseClient() {
  if (browserClient !== undefined) return browserClient;
  const environment = readSupabasePublicEnvironment();
  browserClient = environment
    ? createBrowserClient(environment.url, environment.publishableKey)
    : null;
  return browserClient;
}
