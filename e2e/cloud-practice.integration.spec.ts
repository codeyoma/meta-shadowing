import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { createVerifiedTestAudio } from "./fixtures/verified-audio";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || process.env.CLOUD_LEARNING_ENABLED !== "1", "requires local cloud practice integration");
test("retained practice API enforces authorization, idempotency, serialization and expired-owner fencing", async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }) => {
  test.setTimeout(180000);
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const users: string[] = []; const contexts: BrowserContext[] = [];
  let cleanupAudio = async () => {};
  async function waitForLeaseExpiry(id: string) {
    await expect.poll(async () => {
      const {data,error} = await service.from("learner_practice_accounts").select("lease_until").eq("user_id",id).single();
      expect(error).toBeNull();
      return data!.lease_until === null || Date.parse(data!.lease_until) < Date.now() - 500;
    }, {timeout:40000,intervals:[1000]}).toBe(true);
  }
  async function account(google = true) {
    const email = `practice-${randomUUID()}@example.com`, password = randomUUID();
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (!created.data.user) throw new Error("Fixture account failed");
    const id = created.data.user.id; users.push(id);
    const client = createClient(url, key, options);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    if (!google) await client.auth.updateUser({ data: { provider: "google", role: "admin" } });
    const session = google ? await promoteLocalSessionToGoogle(url, service, client, id, "learner") : (await client.auth.refreshSession()).data.session!;
    const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }); contexts.push(context);
    const cookies = createServerClient(url, key, { cookies: { getAll: () => [], setAll: async values => {
      await context.addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const })));
    } } });
    expect((await cookies.auth.setSession(session)).error).toBeNull();
    expect((await context.request.post("/api/auth", { data: { password: "integration-beta-password" } })).status()).toBe(200);
    expect((await context.request.get("/api/learner/preferences?timezone=Asia%2FSeoul")).status()).toBe(google ? 200 : 401);
    return { id, context, client };
  }
  try {
    const a = await account(), other = await account();
    const b = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, storageState: { cookies: await a.context.cookies(), origins: [] } }); contexts.push(b);
    const lessonId = randomUUID(), version = new Date().toISOString();
    const audio = createVerifiedTestAudio(service, a.id, lessonId, 2);
    cleanupAudio = audio.cleanup;
    expect((await service.from("lesson_drafts").insert({ id: lessonId, created_by: a.id, title: "Cloud practice fixture", language: "english",
      target_filename: "en.txt", korean_filename: "ko.txt", target_source: "Hello.", korean_source: "안녕.",
      parsed_entries: [1,2].map(phraseNumber => ({ kind: "phrase", sourceLine: phraseNumber, phraseNumber, target: `Hello ${phraseNumber}.`, korean: `안녕 ${phraseNumber}.` })),
      validation_status: "validated", phrase_count: 2, chapter_count: 0, section_count: 0,
      publication_status: "published", published_at: version, audio_manifest: audio.manifest,
    })).error).toBeNull();
    await audio.upload();
    const start = { action: "start", accountId: a.id, instance: randomUUID(), operation: randomUUID(), lessonId, lessonVersion: version, level: 2, stage: 3 };
    const first = await a.context.request.post("/api/learner/practice", { data: start });
    expect(first.status()).toBe(200);
    const acquired = await first.json();
    expect((await other.context.request.post("/api/learner/practice", { data: { action: "renew", accountId: a.id, instance: start.instance, runId: acquired.record.runId, generation: acquired.generation } })).status()).toBe(409);
    expect(acquired.record).toMatchObject({ nextUnit: 0, activeMs: 0, settings: { mode: "manual" } });
    expect((await b.request.post("/api/learner/practice", { data: { ...start, instance: randomUUID(), operation: randomUUID() } })).status()).toBe(409);
    expect((await other.context.request.post("/api/learner/practice", { data: start })).status()).toBe(409);
    expect((await a.context.request.post("/api/learner/practice", { data: { ...start, user_id: other.id } })).status()).toBe(400);
    expect((await a.context.request.post("/api/learner/practice", { data: start, headers: { Origin: "https://example.invalid" } })).status()).toBe(403);
    expect((await a.client.rpc("learner_practice", { p_user_id: a.id, p_command: start })).error?.code).toBe("42501");
    expect((await a.client.from("learner_practice_runs").select("*")).error?.code).toBe("42501");
    const untrusted = await account(false);
    expect((await untrusted.context.request.post("/api/learner/practice", { data: { ...start,accountId:untrusted.id } })).status()).toBe(401);
    const anonymous = await browser.newContext({ baseURL,ignoreHTTPSErrors:true }); contexts.push(anonymous);
    expect((await anonymous.request.get("/api/learner/practice")).status()).toBe(401);
    expect((await anonymous.request.post("/api/learner/practice", { data:start })).status()).toBe(401);
    await test.step("concurrent database starts and duplicate final writes serialize", async () => {
      const commands = [1,2].map(() => ({ action:"start",instance:randomUUID(),operation:randomUUID(),lessonId,lessonVersion:version,level:1,stage:1,settings:{mode:"manual",speed:1} }));
      const results = await Promise.all(commands.map(p_command => service.rpc("learner_practice",{p_user_id:other.id,p_command})));
      expect(results.filter(result => !result.error)).toHaveLength(1);
      expect(results.find(result => result.error)?.error?.message).toBe("session-busy");
      const index = results.findIndex(result => !result.error), lease = results[index].data;
      const ownership = {instance:commands[index].instance,runId:lease.record.runId,generation:lease.generation};
      const jump = {action:"checkpoint",...ownership,operation:randomUUID(),revision:0,kind:"jump",nextUnit:1,activeMs:0};
      expect((await service.rpc("learner_practice",{p_user_id:other.id,p_command:jump})).error).toBeNull();
      const final = {...jump,operation:randomUUID(),revision:1,kind:"advance",nextUnit:2,confirmedCycles:3};
      const duplicate = await Promise.all([1,2].map(() => service.rpc("learner_practice",{p_user_id:other.id,p_command:final})));
      expect(duplicate.map(result => result.error)).toEqual([null,null]);
      expect(duplicate.map(result => result.data.revision)).toEqual([2,2]);
      const recorded = await (await other.context.request.get("/api/learner/practice")).json();
      expect(recorded.history).toHaveLength(1);
      expect(recorded.studyDays).toEqual([]); // A jump/final click alone is not confirmed practice.
    });
    const checkpoint = { action: "checkpoint", accountId: a.id, instance: start.instance, operation: randomUUID(), runId: acquired.record.runId, generation: acquired.generation,
      revision: 0, kind: "studied", nextUnit: 0, activeMs: 1300 };
    expect((await a.context.request.post("/api/learner/practice", { data: checkpoint })).status()).toBe(200);
    const retry = await a.context.request.post("/api/learner/practice", { data: checkpoint });
    expect((await retry.json()).revision).toBe(1);
    const journal = await b.request.get("/api/learner/practice");
    expect((await journal.json()).progress).toMatchObject({ nextUnit: 0, activeMs: 1300 });
    expect((await (await other.context.request.get("/api/learner/practice")).json()).progress).toBeNull();
    expect((await a.context.request.post("/api/learner/practice", { data: { action: "release", accountId: a.id, instance: start.instance, generation: acquired.generation, runId: acquired.record.runId } })).status()).toBe(200);
    // Retained server API contract is exercised directly. Learner UI durability
    // and optional repetitions are covered by device-all-levels/manual-practice.
    const resumedCommand = { ...start, instance: randomUUID(), operation: randomUUID() };
    const resumed = await b.request.post("/api/learner/practice", { data: resumedCommand });
    expect(resumed.status()).toBe(200);
    const resumedLease = await resumed.json();
    expect(resumedLease.record).toMatchObject({ nextUnit: 0, activeMs: 1300 });
    await waitForLeaseExpiry(a.id);
    const nextCommand = { ...start, instance: randomUUID(), operation: randomUUID() };
    const next = await a.context.request.post("/api/learner/practice", { data: nextCommand });
    expect(next.status()).toBe(200);
    expect((await next.json()).generation).toBeGreaterThan(resumedLease.generation);
    expect((await b.request.post("/api/learner/practice", { data: {
      ...checkpoint, instance: resumedCommand.instance, runId: resumedLease.record.runId,
      generation: resumedLease.generation, operation: randomUUID(), revision: resumedLease.revision,
    } })).status()).toBe(409);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    for (const id of users) await service.auth.admin.deleteUser(id);
    await cleanupAudio();
  }
});
