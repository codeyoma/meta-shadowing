import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createLearnerCookie, LEARNER_COOKIE_NAME } from "./auth";

const { stored, getClaims, client } = vi.hoisted(() => ({
  stored: new Map<string, string>(), getClaims: vi.fn(), client: vi.fn()
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => {
  const value = stored.get(name); return value ? { value } : undefined;
} }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("./supabase/server", () => ({ createServerSupabaseClient: client }));
import { hasLearnerAccess, requireLearner } from "./server-auth";

const googleClaims = { sub: "google-learner", role: "authenticated", email: "learner@example.com", is_anonymous: false,
  app_metadata: { provider: "google", providers: ["google"] } };

beforeEach(() => {
  stored.clear(); vi.clearAllMocks();
  vi.stubEnv("BETA_PASSWORD", "beta-test"); vi.stubEnv("LEARNER_COOKIE_SECRET", "test-cookie-signing-secret");
  stored.set(LEARNER_COOKIE_NAME, createLearnerCookie("test-cookie-signing-secret"));
  client.mockResolvedValue({ auth: { getClaims } });
  getClaims.mockResolvedValue({ data: { claims: googleClaims }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("two-step learner access", () => {
  it("allows a verified Google session only after beta entry", async () => {
    expect(await hasLearnerAccess()).toBe(true);
    stored.clear();
    expect(await hasLearnerAccess()).toBe(false);
    await expect(requireLearner()).rejects.toThrow("redirect:/");
  });
  it("does not treat a beta cookie as a Google session", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await hasLearnerAccess()).toBe(false);
    await expect(requireLearner()).rejects.toThrow("redirect:/login");
  });
  it.each([
    { ...googleClaims, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { provider: "google" } },
    { ...googleClaims, app_metadata: { provider: "github", providers: ["github"] } },
    { ...googleClaims, is_anonymous: true },
    { ...googleClaims, sub: "" },
    { ...googleClaims, email: "" },
    { ...googleClaims, role: "anon" },
  ])("rejects non-Google, anonymous and malformed identities %#", async claims => {
    getClaims.mockResolvedValue({ data: { claims }, error: null });
    expect(await hasLearnerAccess()).toBe(false);
  });
  it("accepts a Google identity linked by the auth provider, not user-editable metadata", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...googleClaims, app_metadata: { provider: "email", providers: ["email", "google"] } } }, error: null });
    expect(await hasLearnerAccess()).toBe(true);
  });
  it("fails closed when session verification fails or auth is unconfigured", async () => {
    getClaims.mockResolvedValue({ data: { claims: googleClaims }, error: { message: "Invalid token" } });
    expect(await hasLearnerAccess()).toBe(false);
    getClaims.mockRejectedValue(new Error("Auth unavailable"));
    expect(await hasLearnerAccess()).toBe(false);
    client.mockResolvedValue(null);
    expect(await hasLearnerAccess()).toBe(false);
  });
  it("rejects expired or tampered beta access despite a Google session", async () => {
    stored.set(LEARNER_COOKIE_NAME, createLearnerCookie("test-cookie-signing-secret", 0));
    expect(await hasLearnerAccess()).toBe(false);
    stored.set(LEARNER_COOKIE_NAME, createLearnerCookie("wrong-key"));
    expect(await hasLearnerAccess()).toBe(false);
  });
});
