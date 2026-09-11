import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { expect, test } from "./fixtures/cloud-ui";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";

test("real snapshot HTTP rejects foreign identities and isolates atomic learning merges", async ({ page, browser, baseURL }) => {
  const endpoint = "/api/learner/snapshot";
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const profile = await page.request.get("/api/learner/preferences");
  expect(profile.status()).toBe(200);
  const accountA = (await profile.json()).profile.accountId as string;
  const first = { protocolVersion: 1, accountId: accountA, options: { expectedRevision: 0, preferredLevel: 3, settings: { speed: 2 } }, runs: [], history: [], studyDays: ["2026-09-09"] };
  expect((await page.request.get(endpoint)).status()).toBe(200);
  expect(await (await page.request.get(endpoint)).json()).toEqual({ snapshot: null, optionsRevision: 0 });
  expect((await page.request.put(endpoint, { data: first })).status()).toBe(200);
  const second = { ...first, options: { expectedRevision: 1, preferredLevel: 7, settings: {} }, studyDays: [] };
  expect((await page.request.put(endpoint, { data: second })).status()).toBe(200);
  const replacement = { schemaVersion: 1, accountId: accountA, preferredLevel: 7, settings: {}, runs: [], history: [], studyDays: ["2026-09-09"] };
  const readA = await page.request.get(endpoint);
  expect(readA.headers()["cache-control"]).toBe("private, no-store");
  expect(await readA.json()).toEqual({ snapshot: replacement, optionsRevision: 2 });
  expect((await page.request.put(endpoint, { data: first })).status()).toBe(409);
  expect((await page.request.put(endpoint, { data: { ...first, options: undefined, studyDays: ["2026-09-10"] } })).status()).toBe(200);
  replacement.studyDays.push("2026-09-10");
  expect((await page.request.put(endpoint, { data: first, headers: { Origin: "https://foreign.example" } })).status()).toBe(403);

  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const email = `snapshot-isolation-${randomUUID()}@example.com`, password = randomUUID();
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Disposable snapshot account creation failed");
  let other: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    other = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
    expect((await other.request.get(endpoint)).status()).toBe(401);
    expect((await other.request.put(endpoint, { data: first })).status()).toBe(401);
    await other.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    // The beta gate alone must not count as an authenticated learner session.
    expect((await other.request.get(endpoint)).status()).toBe(401);
    expect((await other.request.put(endpoint, { data: first })).status()).toBe(401);
    const client = createClient(url, key, options);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const session = await promoteLocalSessionToGoogle(url, service, client, created.data.user.id, "learner");
    const otherContext = other;
    const cookies = createServerClient(url, key, { cookies: {
      getAll: () => [],
      setAll: async values => { await otherContext.addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const }))); },
    } });
    expect((await cookies.auth.setSession(session)).error).toBeNull();
    const readB = await other.request.get(endpoint);
    expect(readB.status()).toBe(200);
    expect(await readB.json()).toEqual({ snapshot: null, optionsRevision: 0 });
    expect((await other.request.put(endpoint, { data: first })).status()).toBe(409);
    const ownB = { ...first, accountId: created.data.user.id, options: { expectedRevision: 0, preferredLevel: 8, settings: { speed: 2 } } };
    const savedB = { schemaVersion: 1, accountId: ownB.accountId, preferredLevel: 8, settings: { speed: 2 }, runs: [], history: [], studyDays: ["2026-09-09"] };
    expect((await other.request.put(endpoint, { data: ownB })).status()).toBe(200);
    expect(await (await other.request.get(endpoint)).json()).toEqual({ snapshot: savedB, optionsRevision: 1 });
    expect((await page.request.put(endpoint, { data: ownB })).status()).toBe(409);
    expect(await (await page.request.get(endpoint)).json()).toEqual({ snapshot: replacement, optionsRevision: 2 });
    expect(await (await other.request.get(endpoint)).json()).toEqual({ snapshot: savedB, optionsRevision: 1 });
  } finally {
    try { await other?.close(); }
    finally {
      const removed = await service.auth.admin.deleteUser(created.data.user.id);
      if (removed.error) throw new Error("Disposable snapshot account cleanup failed");
    }
  }
});
