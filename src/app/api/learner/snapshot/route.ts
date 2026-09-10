import { parseAccountSnapshot, SNAPSHOT_MAX_BYTES, SnapshotError } from "@/lib/account-snapshot";
import { readAccountSnapshot, writeAccountSnapshot } from "@/lib/account-snapshot-repository";
import { authorizeCloudLearner } from "@/lib/cloud-learner-request";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

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
    return Response.json({ snapshot: await readAccountSnapshot(identity.id) }, { headers });
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
  if (!bytes) return failure("snapshot-too-large", 413);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return failure("invalid-snapshot", 400);
  }
  if (value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as { accountId?: unknown }).accountId === "string"
    && (value as { accountId: string }).accountId !== identity.id) {
    return failure("account-changed", 409);
  }
  let snapshot;
  try {
    snapshot = parseAccountSnapshot(value, identity.id);
  } catch (error) {
    if (error instanceof SnapshotError) return failure("invalid-snapshot", 400);
    return failure("snapshot-save-failed", 503);
  }
  try {
    await writeAccountSnapshot(identity.id, snapshot);
    return Response.json({ updated: true }, { headers });
  } catch {
    return failure("snapshot-save-failed", 503);
  }
}
