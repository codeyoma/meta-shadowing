import { beforeEach, describe, expect, it, vi } from "vitest";

const { beta, identity, client, oauth, exchange, signOut } = vi.hoisted(() => ({
  beta: vi.fn(), identity: vi.fn(), client: vi.fn(), oauth: vi.fn(), exchange: vi.fn(), signOut: vi.fn()
}));
vi.mock("@/lib/server-auth", () => ({ hasBetaAccess: beta, getGoogleLearnerIdentity: identity }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: client }));
import { POST } from "./google/route";
import { GET } from "./callback/route";

const origin = "https://app.example.com";
const start = (originHeader: string | null = origin) => new Request(`${origin}/auth/google`, {
  method: "POST", headers: originHeader ? { Origin: originHeader, Host: "app.example.com" } : {}
});
const callback = (query: string) => GET(new Request(`${origin}/auth/callback${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  beta.mockResolvedValue(true);
  identity.mockResolvedValue({ id: "learner", email: "learner@example.com" });
  client.mockResolvedValue({ auth: { signInWithOAuth: oauth, exchangeCodeForSession: exchange, signOut } });
  oauth.mockResolvedValue({ data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, error: null });
  exchange.mockResolvedValue({ data: {}, error: null });
  signOut.mockResolvedValue({ error: null });
});

describe("Google OAuth start", () => {
  it("starts only Google PKCE with a fixed same-origin callback and no-store redirect", async () => {
    const response = await POST(start());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/auth/v1/authorize?provider=google");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true } });
  });
  it.each([null, "null", "https://attacker.example", "https://app.example.com.attacker.example", "http://app.example.com"])("rejects an untrusted or missing POST origin: %s", async supplied => {
    expect((await POST(start(supplied))).status).toBe(403);
    expect(oauth).not.toHaveBeenCalled();
  });
  it("requires beta access before contacting OAuth", async () => {
    beta.mockResolvedValue(false);
    expect((await POST(start())).headers.get("location")).toBe("/");
    expect(oauth).not.toHaveBeenCalled();
  });
  it("shows a retryable failure without exposing provider errors", async () => {
    oauth.mockRejectedValue(new Error("sensitive-provider-details"));
    expect((await POST(start())).headers.get("location")).toBe("/login?error=unavailable");
    client.mockResolvedValue(null);
    expect((await POST(start())).headers.get("location")).toBe("/login?error=unavailable");
  });
});

describe("Google OAuth callback", () => {
  it("exchanges the PKCE code and returns only to languages, ignoring redirect input", async () => {
    const response = await callback("?code=test-code&sb_flow_id=test-flow&next=https://attacker.example");
    expect(exchange).toHaveBeenCalledWith("test-code", { flowId: "test-flow" });
    expect(response.headers.get("location")).toBe("/languages");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("requires beta access even for a valid callback", async () => {
    beta.mockResolvedValue(false);
    expect((await callback("?code=test-code")).headers.get("location")).toBe("/");
    expect(exchange).not.toHaveBeenCalled();
  });
  it("shows cancellation without exchanging a code or signing out the existing session", async () => {
    expect((await callback("?error=access_denied&code=unused")).headers.get("location")).toBe("/login?error=cancelled");
    expect(exchange).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
  it.each(["", "?code=", "?code=a&code=b", "?code=a&sb_flow_id=", "?code=a&sb_flow_id=b&sb_flow_id=c"])("rejects malformed callback: %s", async query => {
    expect((await callback(query)).headers.get("location")).toBe("/login?error=invalid-session");
    expect(exchange).not.toHaveBeenCalled();
  });
  it("rejects failed/replayed code exchanges without signing out an existing session", async () => {
    exchange.mockResolvedValue({ data: {}, error: { message: "expired" } });
    expect((await callback("?code=used")).headers.get("location")).toBe("/login?error=invalid-session");
    expect(identity).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
  it("removes only a newly exchanged session if Google identity validation fails", async () => {
    identity.mockResolvedValue(null);
    expect((await callback("?code=wrong-provider")).headers.get("location")).toBe("/login?error=invalid-session");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("preserves the browser's origin when Next uses a different internal bind host", async () => {
    const response = await GET(new Request("http://0.0.0.0:3000/auth/callback?code=test-code", { headers: { Host: "localhost:3000" } }));
    expect(response.headers.get("location")).toBe("/languages");
    expect(new URL(response.headers.get("location")!, "http://localhost:3000/auth/callback").origin).toBe("http://localhost:3000");
  });
});
