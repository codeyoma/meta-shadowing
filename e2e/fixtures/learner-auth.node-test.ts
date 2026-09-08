import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { createServerClient } from "@supabase/ssr";
// @ts-expect-error Node 24 runs this fixture test directly and requires the explicit .ts extension.
import { createFakeSupabaseAuthServer, createLearnerAuthStorageState, FAKE_SUPABASE_PUBLISHABLE_KEY } from "./learner-auth.ts";

test("the default storage state contains a Google session accepted by the fake Auth user endpoint", async (t) => {
  const server = createFakeSupabaseAuthServer("http://127.0.0.1:0");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address();
  assert(address && typeof address === "object");
  const authUrl = `http://127.0.0.1:${address.port}`;
  const state = createLearnerAuthStorageState("http://127.0.0.1:3000", authUrl);
  assert.equal(state.cookies.length, 1);
  assert.equal(state.cookies[0]?.name, "sb-127-auth-token");
  assert.equal(state.cookies[0]?.domain, "127.0.0.1");
  assert.match(state.cookies[0]?.value ?? "", /^base64-/);

  const encodedSession = state.cookies[0]!.value.slice("base64-".length);
  const session = JSON.parse(Buffer.from(encodedSession, "base64url").toString("utf8")) as {
    access_token: string;
  };
  const response = await fetch(`${authUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${session.access_token}` }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "learner@example.com",
    email_confirmed_at: "2023-11-14T22:13:20.000Z",
    phone: "",
    confirmed_at: "2023-11-14T22:13:20.000Z",
    last_sign_in_at: "2023-11-14T22:13:20.000Z",
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: {
      avatar_url: "https://example.com/test-learner.png",
      email: "learner@example.com",
      email_verified: true,
      full_name: "Test Learner",
      iss: "https://accounts.google.com",
      name: "Test Learner",
      picture: "https://example.com/test-learner.png",
      provider_id: "test-google-provider-id",
      sub: "test-google-provider-id"
    },
    identities: [],
    created_at: "2023-11-14T22:13:20.000Z",
    updated_at: "2023-11-14T22:13:20.000Z",
    is_anonymous: false
  });

  const supabase = createServerClient(authUrl, FAKE_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => state.cookies.map(({ name, value }) => ({ name, value })),
      setAll: () => undefined
    }
  });
  const verified = await supabase.auth.getClaims();
  assert.equal(verified.error, null);
  assert.equal(verified.data?.claims.sub, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(verified.data?.claims.app_metadata, { provider: "google", providers: ["google"] });
});

test("the fake Google authorization endpoint exchanges a matching PKCE verifier exactly once", async (t) => {
  const server = createFakeSupabaseAuthServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address();
  assert(address && typeof address === "object");
  const authUrl = `http://127.0.0.1:${address.port}`;
  const verifier = "fixture-verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectTo = "http://127.0.0.1:3000/auth/callback?sb_flow_id=fixture-flow-id";
  const authorize = new URL(`${authUrl}/auth/v1/authorize`);
  authorize.search = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: "s256"
  }).toString();

  const firstAuthorization = await fetch(authorize, { redirect: "manual" });
  const secondAuthorization = await fetch(authorize, { redirect: "manual" });
  assert.equal(firstAuthorization.status, 302);
  assert.equal(firstAuthorization.headers.get("location"), secondAuthorization.headers.get("location"));
  const callback = new URL(firstAuthorization.headers.get("location")!);
  assert.equal(callback.origin + callback.pathname, "http://127.0.0.1:3000/auth/callback");
  assert.equal(callback.searchParams.get("sb_flow_id"), "fixture-flow-id");
  const code = callback.searchParams.get("code");
  assert.match(code ?? "", /^test-google-/);

  const rejectedVerifier = await fetch(`${authUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: `${verifier}-wrong` })
  });
  assert.equal(rejectedVerifier.status, 400);

  // A failed exchange burns the code. Re-authorizing deterministically issues the same code again.
  const renewedAuthorization = await fetch(authorize, { redirect: "manual" });
  assert.equal(renewedAuthorization.headers.get("location"), firstAuthorization.headers.get("location"));
  const tokenResponse = await fetch(`${authUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier })
  });
  assert.equal(tokenResponse.status, 200);
  const session = await tokenResponse.json() as {
    access_token: string;
    refresh_token: string;
    user: { app_metadata: { providers: string[] } };
  };
  assert.deepEqual(session.user.app_metadata.providers, ["google"]);

  const userResponse = await fetch(`${authUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${session.access_token}` }
  });
  assert.equal(userResponse.status, 200);

  const replay = await fetch(`${authUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier })
  });
  assert.equal(replay.status, 400);
});

test("the fake provider can send an OAuth cancellation back to the callback", async (t) => {
  const server = createFakeSupabaseAuthServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const address = server.address();
  assert(address && typeof address === "object");
  const authUrl = `http://127.0.0.1:${address.port}`;
  const authorize = new URL(`${authUrl}/auth/v1/authorize`);
  authorize.search = new URLSearchParams({
    provider: "google",
    redirect_to: "http://127.0.0.1:3000/auth/callback?sb_flow_id=cancel-flow-id",
    code_challenge: "JqFjW0OV8B7ZVneEJBCsD_VXUUNpG6C1etGnaxpK4TA",
    code_challenge_method: "s256",
    mode: "cancel"
  }).toString();

  const response = await fetch(authorize, { redirect: "manual" });
  assert.equal(response.status, 302);
  const callback = new URL(response.headers.get("location")!);
  assert.equal(callback.searchParams.get("sb_flow_id"), "cancel-flow-id");
  assert.equal(callback.searchParams.get("error"), "access_denied");
  assert.equal(callback.searchParams.get("error_code"), "provider_cancelled");
  assert.equal(callback.searchParams.has("code"), false);
});
