// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), identity: vi.fn(), progress: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ authorizeAdminMutation: mocks.authorize, getAdminIdentity: mocks.identity }));
vi.mock("@/lib/sentence-syntax-repository", () => ({
  getSentenceSyntaxProgress: mocks.progress, runSentenceSyntaxBatch: mocks.run,
  SyntaxStorageError: class extends Error { constructor(readonly status: number, message: string) { super(message); } }
}));
import { GET, POST } from "./route";
const id = "44444444-4444-4444-8444-444444444444";
const admin = { id: "admin-id", email: "admin@example.com" };
const context = { params: Promise.resolve({ id }) };
const result = { total: 1, complete: 0, pending: 1, processing: 0, failed: 0, configured: false, estimatedUnits: 1, errors: [] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue(admin);
  mocks.authorize.mockResolvedValue(admin);
  mocks.progress.mockResolvedValue(result);
  mocks.run.mockResolvedValue(result);
});
describe("syntax administrator routes", () => {
  it("does not expose saved analysis status to unauthenticated clients", async () => {
    mocks.identity.mockResolvedValue(null);
    expect((await GET(new Request("https://app.example/api/admin/drafts/id/syntax"), context)).status).toBe(401);
    expect(mocks.progress).not.toHaveBeenCalled();
  });
  it("does not queue billable analysis after an origin/auth rejection", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ error: "invalid-origin" }, { status: 403 }));
    expect((await POST(new Request("https://app.example/api/admin/drafts/id/syntax", { method: "POST" }), context)).status).toBe(403);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("validates draft IDs before touching the data store", async () => {
    expect((await GET(new Request("https://app.example/"), { params: Promise.resolve({ id: "bad" }) })).status).toBe(400);
    expect(mocks.progress).not.toHaveBeenCalled();
  });
  it("returns no-store progress and only retries failures when explicitly requested", async () => {
    const response = await GET(new Request("https://app.example/"), context);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual(result);
    await POST(new Request("https://app.example/?retry=failed", { method: "POST" }), context);
    expect(mocks.run).toHaveBeenLastCalledWith(admin, id, true);
    await POST(new Request("https://app.example/", { method: "POST" }), context);
    expect(mocks.run).toHaveBeenLastCalledWith(admin, id, false);
  });
  it("does not return database or provider internals when a batch fails", async () => {
    mocks.run.mockRejectedValue(new Error("secret connection string"));
    const response = await POST(new Request("https://app.example/", { method: "POST" }), context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret connection string");
  });
});
