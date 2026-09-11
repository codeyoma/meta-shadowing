// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorize, readSnapshot, writeSnapshot } = vi.hoisted(() => ({
  authorize: vi.fn(), readSnapshot: vi.fn(), writeSnapshot: vi.fn(),
}));
vi.mock("@/lib/cloud-learner-request", () => ({ authorizeCloudLearner: authorize }));
vi.mock("@/lib/account-snapshot-repository", () => ({
  readAccountSnapshot: readSnapshot, writeAccountSnapshot: writeSnapshot,
  SnapshotAuthorizationError: class extends Error { constructor() { super("unauthorized"); } },
}));
import { GET, PUT } from "./route";
import { LearningMergeError } from "@/lib/learning-merge";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccountId = "22222222-2222-4222-8222-222222222222";
const snapshot = (preferredLevel = 1, owner = accountId) => ({
  protocolVersion: 1,
  accountId: owner,
  options: { expectedRevision: 0, preferredLevel, settings: {} },
  runs: [],
  history: [],
  studyDays: [],
});
const request = (body: BodyInit | null = null, headers: HeadersInit = { "Content-Type": "application/json" }) =>
  new Request("http://localhost/api/learner/snapshot", { method: body === null ? "GET" : "PUT", headers, body });

beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ id: accountId });
  readSnapshot.mockResolvedValue({ snapshot: null, optionsRevision: 0 });
  writeSnapshot.mockResolvedValue({ optionsRevision: 1 });
});

describe("account snapshot API", () => {
  it("stops unauthenticated and foreign-origin requests at the shared learner boundary", async () => {
    const denied = Response.json({ error: "unauthorized" }, { status: 401 });
    authorize.mockResolvedValueOnce(denied);
    expect((await GET(request())).status).toBe(401);
    authorize.mockResolvedValueOnce(Response.json({ error: "invalid-origin" }, { status: 403 }));
    expect((await PUT(request(JSON.stringify(snapshot())))).status).toBe(403);
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("returns an absent or valid snapshot privately without shared caching", async () => {
    const absent = await GET(request());
    expect(await absent.json()).toEqual({ snapshot: null, optionsRevision: 0 });
    expect(absent.headers.get("Cache-Control")).toBe("private, no-store");
    expect(absent.headers.get("Vary")).toBe("Cookie");
    readSnapshot.mockResolvedValueOnce({ snapshot: snapshot(3), optionsRevision: 4 });
    expect(await (await GET(request())).json()).toEqual({ snapshot: snapshot(3), optionsRevision: 4 });
    expect(readSnapshot).toHaveBeenLastCalledWith(accountId);
  });

  it("reports invalid stored state as unavailable instead of erasing it", async () => {
    readSnapshot.mockRejectedValue(new Error("sensitive stored payload"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "snapshot-unavailable" });
  });

  it("rejects unsupported content types before reading or writing", async () => {
    const response = await PUT(request("{}", { "Content-Type": "text/plain" }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "invalid-content-type" });
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing required field", JSON.stringify({ protocolVersion: 1, accountId })],
    ["unknown field", JSON.stringify({ ...snapshot(), secret: "no" })],
  ])("rejects %s without changing cloud state", async (_label, body) => {
    const response = await PUT(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-merge" });
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a valid snapshot for another account as a stale-account conflict", async () => {
    const response = await PUT(request(JSON.stringify(snapshot(1, otherAccountId))));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "account-changed" });
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("bounds the streamed UTF-8 request even without Content-Length", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (let index = 0; index < 33; index += 1) controller.enqueue(encoder.encode("x".repeat(64 * 1024)));
        controller.close();
      },
    });
    const oversized = new Request("http://localhost/api/learner/snapshot", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(oversized.headers.has("content-length")).toBe(false);
    const response = await PUT(oversized);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "merge-limit" });
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("maps request stream cancellation failures to a stable private error", async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel() { throw new Error("transport detail"); },
    });
    const failing = new Request("http://localhost/api/learner/snapshot", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await PUT(failing);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "snapshot-save-failed" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("acknowledges versioned merges with the committed options revision", async () => {
    const first = snapshot(2);
    const replacement = snapshot(7);
    expect((await PUT(request(JSON.stringify(first)))).status).toBe(200);
    const response = await PUT(request(JSON.stringify(replacement)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: true, optionsRevision: 1 });
    expect(writeSnapshot).toHaveBeenNthCalledWith(1, accountId, first);
    expect(writeSnapshot).toHaveBeenNthCalledWith(2, accountId, replacement);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns a generic safe error when persistence fails", async () => {
    writeSnapshot.mockRejectedValue(new Error("database secret"));
    const response = await PUT(request(JSON.stringify(snapshot())));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "snapshot-save-failed" });
  });

  it.each([{}, { schemaVersion: 1 }, { protocolVersion: 2 }])("rejects legacy and unsupported clients with an actionable code", async body => {
    const response = await PUT(request(JSON.stringify(body)));
    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({ error: "client-update-required" });
    expect(writeSnapshot).not.toHaveBeenCalled();
  });
  it.each([["invalid-merge", 400], ["options-conflict", 409], ["merge-limit", 413], ["account-changed", 409], ["client-update-required", 426]] as const)("maps %s to its stable status", async (code, status) => {
    writeSnapshot.mockRejectedValue(new LearningMergeError(code));
    const response = await PUT(request(JSON.stringify(snapshot())));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });
});
