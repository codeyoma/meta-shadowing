import "server-only";

import { parseAccountSnapshot, type AccountSnapshot } from "./account-snapshot";
import { createServerSupabaseClient } from "./supabase/server";

// The caller supplies a server-verified identity. The request-bound client keeps
// the user's access token attached so Postgres RLS remains the authority.
export async function readAccountSnapshot(accountId: string): Promise<AccountSnapshot | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Account snapshot storage is unavailable");
  const { data, error } = await supabase
    .from("learner_snapshots")
    .select("schema_version,snapshot")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error("Account snapshot could not be loaded");
  if (!data) return null;
  if (data.schema_version !== 1) throw new Error("Account snapshot version is invalid");
  return parseAccountSnapshot(data.snapshot, accountId);
}

export async function writeAccountSnapshot(accountId: string, value: AccountSnapshot): Promise<void> {
  const snapshot = parseAccountSnapshot(value, accountId);
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Account snapshot storage is unavailable");
  const { error } = await supabase.from("learner_snapshots").upsert({
    account_id: accountId,
    schema_version: snapshot.schemaVersion,
    snapshot,
  }, { onConflict: "account_id" });
  if (error) throw new Error("Account snapshot could not be saved");
}
