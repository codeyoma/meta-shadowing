import "server-only";

import { readAdminTestEnvironment } from "./admin-test-mode";
import { DEFAULT_SESSION_SETTINGS, resolveSessionSettings, type SessionSettings } from "./session-settings";
import { createSecretSupabaseClient } from "./supabase/secret";
import { createServerSupabaseClient } from "./supabase/server";

export async function getSessionDefaults(): Promise<SessionSettings> {
  if (readAdminTestEnvironment()) return DEFAULT_SESSION_SETTINGS;
  const supabase = createSecretSupabaseClient();
  if (!supabase) return DEFAULT_SESSION_SETTINGS;
  const { data, error } = await supabase.from("session_defaults").select("settings").eq("id", true).single();
  if (error) throw new Error("Global session defaults could not be loaded.");
  return resolveSessionSettings(data.settings);
}

export async function updateSessionDefaults(settings: SessionSettings): Promise<void> {
  const supabase = await createServerSupabaseClient();
  if (!supabase || readAdminTestEnvironment()) throw new Error("Persistent Supabase configuration is required.");
  // Use the administrator's session, not the service role: RLS must authorize the mutation too.
  const { error } = await supabase.from("session_defaults")
    .update({ settings: resolveSessionSettings(settings), updated_at: new Date().toISOString() }).eq("id", true).select("id").single();
  if (error) throw new Error("Global session defaults could not be saved.");
}
