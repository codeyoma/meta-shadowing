// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { readCredentials, authHeaders, createJwt } = vi.hoisted(() => ({
  readCredentials: vi.fn(), authHeaders: vi.fn(), createJwt: vi.fn()
}));
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ readFile: readCredentials }));
vi.mock("google-auth-library", () => ({ JWT: createJwt }));
import { analyzeSentence, hasGoogleSyntaxCredentials } from "./google-syntax";

const result = {
  language: "en", sentences: [{ text: { content: "😀 Hi", beginOffset: 0 } }],
  tokens: [
    { text: { content: "😀", beginOffset: 0 }, lemma: "😀", partOfSpeech: { tag: "X" }, dependencyEdge: { headTokenIndex: 1, label: "DEP" } },
    { text: { content: "Hi", beginOffset: 3 }, lemma: "Hi", partOfSpeech: { tag: "X" }, dependencyEdge: { headTokenIndex: 1, label: "ROOT" } }
  ]
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  createJwt.mockImplementation(function () { return { getRequestHeaders: authHeaders }; });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Google syntax boundary", () => {
  const serviceAccount = { type: "service_account", client_email: "syntax@example.iam.gserviceaccount.com", private_key: "fixture-private-key", private_key_id: "fixture-id" };
  it("uses a service account JSON file and reuses its token client without sending the private key to the API", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/test/valid-service-account.json");
    readCredentials.mockResolvedValue(JSON.stringify(serviceAccount));
    authHeaders.mockResolvedValue(new Headers({ Authorization: "Bearer fixture-token" }));
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(result)));
    vi.stubGlobal("fetch", fetcher);
    expect(hasGoogleSyntaxCredentials()).toBe(true);
    expect(await analyzeSentence("😀 Hi", "en")).toEqual(result);
    expect(await analyzeSentence("😀 Hi", "en")).toEqual(result);
    expect(readCredentials).toHaveBeenCalledTimes(1);
    expect(createJwt).toHaveBeenCalledWith(expect.objectContaining({
      email: serviceAccount.client_email, key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-language"]
    }));
    const [url, init] = fetcher.mock.calls[0];
    expect(authHeaders).toHaveBeenCalledWith(url);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer fixture-token");
    expect(new Headers(init.headers).has("x-goog-api-key")).toBe(false);
    expect(JSON.stringify(init)).not.toContain(serviceAccount.private_key);
  });
  it("keeps explicit API-key configuration working when a credential file is also set", async () => {
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/test/unused.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await analyzeSentence("😀 Hi", "en");
    expect(readCredentials).not.toHaveBeenCalled();
    expect(createJwt).not.toHaveBeenCalled();
  });
  it.each(["not-json", JSON.stringify({ type: "authorized_user", private_key: "secret" }), JSON.stringify({ type: "service_account" })])("rejects invalid or non-service-account credentials without disclosing their contents", async contents => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/test/invalid-service-account.json");
    readCredentials.mockResolvedValue(contents);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(analyzeSentence("hello", "en")).rejects.toMatchObject({ code: "invalid-credentials", message: "invalid-credentials" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(createJwt).not.toHaveBeenCalled();
  });
  it("redacts file errors and can recover after a missing credential file is supplied", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/test/recoverable-service-account.json");
    readCredentials.mockRejectedValueOnce(new Error("ENOENT /private/path"))
      .mockResolvedValueOnce(JSON.stringify(serviceAccount));
    authHeaders.mockResolvedValue(new Headers({ Authorization: "Bearer fixture-token" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await expect(analyzeSentence("😀 Hi", "en")).rejects.toMatchObject({ code: "credentials-unavailable", message: "credentials-unavailable" });
    expect(await analyzeSentence("😀 Hi", "en")).toEqual(result);
  });
  it("redacts authentication errors before they can be persisted", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "/test/failed-authentication.json");
    readCredentials.mockResolvedValue(JSON.stringify(serviceAccount));
    authHeaders.mockRejectedValue(new Error("private token request details"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(analyzeSentence("hello", "en")).rejects.toMatchObject({ code: "google-auth", message: "google-auth" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends a server-only header and explicit language/UTF16; preserves provider results", async () => {
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal("fetch", fetcher);
    expect(await analyzeSentence("😀 Hi", "en")).toEqual(result);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://language.googleapis.com/v1/documents:analyzeSyntax");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({ document: { type: "PLAIN_TEXT", language: "en", content: "😀 Hi" }, encodingType: "UTF16" });
  });
  it("does not send a request without credentials or for an oversized sentence", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "");
    await expect(analyzeSentence("hello", "en")).rejects.toMatchObject({ code: "not-configured" });
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "test-key");
    await expect(analyzeSentence("a".repeat(20_001), "en")).rejects.toMatchObject({ code: "sentence-too-long" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects incorrect offsets instead of storing misaligned tokens", async () => {
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "test-key");
    const invalid = structuredClone(result);
    invalid.tokens[1].text.beginOffset = 2;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(invalid)));
    await expect(analyzeSentence("😀 Hi", "en")).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("redacts provider error bodies and reports quota errors separately", async () => {
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider error", { status: 429 })));
    await expect(analyzeSentence("hello", "en")).rejects.toMatchObject({ code: "google-429", message: "google-429" });
  });
  it("reports timeouts as retryable analysis failures", async () => {
    vi.stubEnv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    await expect(analyzeSentence("hello", "en")).rejects.toMatchObject({ code: "timeout" });
  });
});
