import { authorizeCloudLearner } from "@/lib/cloud-learner-request";
import { createSecretSupabaseClient } from "@/lib/supabase/secret";
import { parsePracticeCommand } from "@/lib/cloud-practice";
import { readLearnerPreferences } from "@/lib/learner-preferences-repository";
import { getSessionDefaults } from "@/lib/session-defaults-repository";
import { resolveSessionSettings } from "@/lib/session-settings";

const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });
export async function GET(request: Request) {
  const identity = await authorizeCloudLearner(request);
  if (identity instanceof Response) return identity;
  try {
    const client = createSecretSupabaseClient();
    if (!client) throw new Error();
    const { data, error } = await client.rpc("read_learner_journal", { p_user_id: identity.id });
    if (error || data?.accountId !== identity.id) throw new Error();
    return Response.json(data, { headers });
  } catch { return failure("temporary-error",503); }
}
export async function POST(request: Request) {
  const identity = await authorizeCloudLearner(request);
  if (identity instanceof Response) return identity;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("invalid-content-type",415);
  const text = await request.text();
  if (text.length > 4096) return failure("command-too-large",413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return failure("invalid-command",400); }
  const command = parsePracticeCommand(body);
  if (!command) return failure("invalid-command",400);
  if (command.accountId !== identity.id) return failure("account-changed",409);
  try {
    const client = createSecretSupabaseClient();
    if (!client) throw new Error();
    let settings;
    if (command.action === "start") {
      const [profile, defaults] = await Promise.all([readLearnerPreferences(identity.id, "UTC"),getSessionDefaults()]);
      settings = resolveSessionSettings(profile.overrides,defaults);
    }
    const { accountId: _accountId, ...verifiedCommand } = command;
    const { data,error } = await client.rpc(command.action === "takeover" ? "takeover_learner_practice" : "learner_practice", { p_user_id: identity.id, p_command: { ...verifiedCommand, ...(settings ? { settings } : {}) } });
    if (error) {
      const conflict = ["session-busy","ownership-lost","lesson-version-changed","operation-conflict","revision-conflict","run-completed","mode-unavailable"];
      if (conflict.includes(error.message)) return failure(error.message,409);
      if (["invalid-command","invalid-checkpoint"].includes(error.message) || error.code?.startsWith("22")) return failure("invalid-command",400);
      throw new Error();
    }
    if (data?.accountId !== identity.id) throw new Error();
    return Response.json(data,{headers});
  } catch { return failure("temporary-error",503); }
}
