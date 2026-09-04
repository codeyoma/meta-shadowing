import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSupabasePublicEnvironment } from "./config";

export function createSecretSupabaseClient() {
  const publicEnvironment = readSupabasePublicEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!publicEnvironment || !secretKey) return null;

  return createClient(publicEnvironment.url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
