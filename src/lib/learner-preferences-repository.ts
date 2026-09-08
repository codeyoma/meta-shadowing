import "server-only";

import type { LearnerPreferences, PreferencePatch } from "./learner-preferences";
import { createSecretSupabaseClient } from "./supabase/secret";

// Callers must supply the server-verified identity, never the request body's ID.
export async function readLearnerPreferences(ownerId: string, timezone: string): Promise<LearnerPreferences> {
  const supabase = createSecretSupabaseClient();
  if (!supabase) throw new Error("Account storage is unavailable");
  const { data, error } = await supabase.rpc("get_learner_preferences", { p_user_id: ownerId, p_timezone: timezone });
  if (error || !data || data.accountId !== ownerId) throw new Error("Account preferences could not be loaded");
  return data;
}

export async function patchLearnerPreferences(ownerId: string, patch: PreferencePatch): Promise<LearnerPreferences & { conflict: boolean }> {
  if (ownerId !== patch.accountId) throw new Error("Account changed");
  const supabase = createSecretSupabaseClient();
  if (!supabase) throw new Error("Account storage is unavailable");
  const { data, error } = await supabase.rpc("patch_learner_preferences", {
    p_user_id: ownerId, p_revision: patch.revision, p_changes: patch.changes,
  });
  if (error || !data || data.accountId !== ownerId) throw new Error("Account preferences could not be saved");
  return data;
}
