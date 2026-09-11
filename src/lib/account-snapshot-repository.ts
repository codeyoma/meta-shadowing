import "server-only";

import { parseAccountSnapshot, type AccountSnapshot } from "./account-snapshot";
import { LearningMergeError, parseLearningMerge, type LearningMerge, type LearningMergeErrorCode } from "./learning-merge";
import { createServerSupabaseClient } from "./supabase/server";

// The caller supplies a server-verified identity. The request-bound client keeps
// the user's access token attached so Postgres RLS remains the authority.
export class SnapshotAuthorizationError extends Error {
  readonly code = "unauthorized";
  constructor() { super("unauthorized"); }
}
export type AccountSnapshotResult = { snapshot: AccountSnapshot | null; optionsRevision: number };
function validRevision(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }

export async function readAccountSnapshot(accountId: string): Promise<AccountSnapshotResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Account snapshot storage is unavailable");
  const { data, error } = await supabase
    .from("learner_snapshots")
    .select("schema_version,snapshot,options_revision")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error("Account snapshot could not be loaded");
  if (!data) return { snapshot: null, optionsRevision: 0 };
  if (data.schema_version !== 1 || !validRevision(data.options_revision)) throw new Error("Account snapshot version is invalid");
  return { snapshot: parseAccountSnapshot(data.snapshot, accountId), optionsRevision: data.options_revision };
}

export async function writeAccountSnapshot(accountId: string, value: LearningMerge): Promise<{ optionsRevision: number }> {
  const batch = parseLearningMerge(value, accountId);
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("snapshot-save-failed");
  const { data, error } = await supabase.rpc("merge_learning_snapshot", { batch });
  if (error) {
    const codes: Record<string, LearningMergeErrorCode> = { P1001: "invalid-merge", P1002: "client-update-required", P1003: "options-conflict", P1004: "account-changed", P1005: "merge-limit" };
    if (Object.hasOwn(codes, error.code)) throw new LearningMergeError(codes[error.code]);
    if (error.code === "42501") throw new SnapshotAuthorizationError();
    throw new Error("snapshot-save-failed");
  }
  if (!data || !validRevision(data.optionsRevision)) throw new Error("snapshot-save-failed");
  return { optionsRevision: data.optionsRevision };
}
