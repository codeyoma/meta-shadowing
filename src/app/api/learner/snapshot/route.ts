import { SNAPSHOT_MAX_BYTES } from "@/lib/account-snapshot";
import { LearningMergeError, parseLearningMerge } from "@/lib/learning-merge";
import { readAccountSnapshot, writeAccountSnapshot, SnapshotAuthorizationError } from "@/lib/account-snapshot-repository";
import { authorizeCloudLearner } from "@/lib/cloud-learner-request";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });
function mergeFailure(error: unknown) {
  if (error instanceof LearningMergeError) {
    const status = { "invalid-merge": 400, "client-update-required": 426, "options-conflict": 409, "account-changed": 409, "merge-limit": 413 }[error.code];
    return failure(error.code, status);
  }
  if (error instanceof SnapshotAuthorizationError) return failure("unauthorized", 401);
  return failure("snapshot-save-failed", 503);
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > SNAPSHOT_MAX_BYTES)) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > SNAPSHOT_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function GET(request: Request) {
  const identity = await authorizeCloudLearner(request);
  if (identity instanceof Response) return identity;
  try {
    return Response.json(await readAccountSnapshot(identity.id), { headers });
  } catch {
    return failure("snapshot-unavailable", 503);
  }
}

export async function PUT(request: Request) {
  const identity = await authorizeCloudLearner(request);
  if (identity instanceof Response) return identity;
  if (!request.headers.get("content-type")?.toLowerCase().match(/^application\/json(?:\s*;|$)/)) {
    return failure("invalid-content-type", 415);
  }
  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedBody(request);
  } catch {
    return failure("snapshot-save-failed", 503);
  }
  if (!bytes) return failure("merge-limit", 413);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return failure("invalid-merge", 400);
  }
  if (value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as { accountId?: unknown }).accountId === "string"
    && (value as { accountId: string }).accountId !== identity.id) {
    return failure("account-changed", 409);
  }
  let snapshot;
  try {
    snapshot = parseLearningMerge(value, identity.id);
  } catch (error) {
    return mergeFailure(error);
  }
  try {
    const result = await writeAccountSnapshot(identity.id, snapshot);
    return Response.json({ updated: true, optionsRevision: result.optionsRevision }, { headers });
  } catch (error) {
    return mergeFailure(error);
  }
}
