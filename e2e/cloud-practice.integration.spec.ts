import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { testRecording, testAudioManifest } from "./fixtures/audio";
import { enterAccountPractice } from "./fixtures/cloud-navigation";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || process.env.CLOUD_LEARNING_ENABLED !== "1", "requires local cloud practice integration");
test("manual practice ownership and acknowledged progress survive independent browsers", async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }, testInfo) => {
  test.setTimeout(180000);
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const users: string[] = []; const contexts: BrowserContext[] = [];
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
    expect((await service.from("lesson_drafts").insert({ id: lessonId, created_by: a.id, title: "Cloud practice fixture", language: "english",
      target_filename: "en.txt", korean_filename: "ko.txt", target_source: "Hello.", korean_source: "안녕.",
      parsed_entries: [1,2].map(phraseNumber => ({ kind: "phrase", sourceLine: phraseNumber, phraseNumber, target: `Hello ${phraseNumber}.`, korean: `안녕 ${phraseNumber}.` })),
      validation_status: "validated", phrase_count: 2, chapter_count: 0, section_count: 0,
      publication_status: "published", published_at: version, audio_manifest: testAudioManifest(2),
    })).error).toBeNull();
    const start = { action: "start", accountId: a.id, instance: randomUUID(), operation: randomUUID(), lessonId, lessonVersion: version, level: 1, stage: 1 };
    const first = await a.context.request.post("/api/learner/practice", { data: start });
    expect(first.status()).toBe(200);
    const acquired = await first.json();
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
    let page = await b.newPage();
    const errors: string[] = [];
    page.on("pageerror",error => errors.push(error.message));
    await b.addInitScript(() => {
      for (const name of ["getItem","setItem","removeItem"] as const) {
        const original = Storage.prototype[name] as (this: Storage, key: string, value?: string) => string | null | void;
        Object.defineProperty(Storage.prototype,name,{ configurable:true,value:function(this: Storage,key: string, value?: string) {
          if (key.startsWith("meta-shadowing:")) throw new Error(`Cloud practice touched browser learning storage: ${name}`);
          return original.call(this,key,value!);
        } });
      }
    });
    await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
    await page.goto(`/player?lesson=${lessonId}&level=1&stage=1`);

    await expect(page.getByRole("button", { name: /첫 원음 듣기/ })).toBeVisible();
    await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
    await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
    await page.route("**/api/learner/practice", async route => {
      if (route.request().postDataJSON()?.action !== "checkpoint") return route.continue();
      expect((await route.fetch()).status()).toBe(200);
      await route.fulfill({ status: 503, json: { error: "temporary-error" } });
    });
    await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
    await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toContainText("저장을 확인하지 못했습니다");
    await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeDisabled();
    await page.unroute("**/api/learner/practice");
    let acknowledge!: () => void;
    const held = new Promise<void>(resolve => { acknowledge = resolve; });
    await page.route("**/api/learner/practice", async route => {
      if (route.request().postDataJSON()?.action !== "checkpoint") return route.continue();
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "저장 재시도", exact: true }).click();
    await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
    acknowledge();
    await expect(page.getByLabel("학습 동기화")).toHaveCount(0);
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await page.unroute("**/api/learner/practice");
    const checkedResume = page.waitForResponse(response => response.url().endsWith("/api/learner/practice") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "renew");
    await page.getByRole("button", { name: /계속 재생/ }).click();
    expect((await checkedResume).status()).toBe(200);
    await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "완료한 듣기", exact: true })).toContainText("필수 1 / 3");
    for (let cycle = 2; cycle <= 3; cycle++) {
      await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
      await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
      await expect(page.getByRole("group", { name: "완료한 듣기", exact: true })).toContainText(`필수 ${cycle} / 3`);
    }
    await test.step("paused REPEAT waits for ownership before the optional two listens", async () => {
      await page.getByRole("button", {name:"학습 메뉴",exact:true}).click();
      await page.getByRole("button", {name:"확인",exact:true}).click();
      let releaseRenewal!: () => void;
      const heldRenewal = new Promise<void>(resolve => { releaseRenewal = resolve; });
      await page.route("**/api/learner/practice",async route => {
        if (route.request().postDataJSON()?.action !== "renew") return route.continue();
        const response = await route.fetch();
        await heldRenewal;
        await route.fulfill({response});
      });
      await page.getByRole("button", {name:/REPEAT/}).click();
      await expect(page.getByLabel("학습 동기화")).toHaveAttribute("aria-busy", "true");
      expect(await page.locator("audio").evaluate((audio:HTMLAudioElement) => audio.paused)).toBe(true);
      releaseRenewal();
      await page.unroute("**/api/learner/practice");
      for (let extra=1;extra<=2;extra++) {
        await page.getByRole("button", {name:/듣기 완료 확인/}).click();
        await expect(page.getByRole("group", {name:"완료한 듣기",exact:true})).toContainText(`추가 ${extra} / 2`);
      }
    });
    await page.getByRole("button", { name: /NEXT/ }).click();
    await expect(page.getByText("Hello 2.", { exact: true })).toBeVisible();
    const confirmedProgress = (await (await b.request.get("/api/learner/practice")).json()).progress;
    await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
    await expect(page.getByText("완료 0 / 16", { exact: true })).toBeVisible();
    await page.close();
    page = await a.context.newPage();
    page.on("pageerror",error => errors.push(error.message));
    await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType:"audio/webm",body:testRecording }));
    const resumed = page.waitForResponse(response => response.url().endsWith("/api/learner/practice") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "start");
    await page.goto(`/player?lesson=${lessonId}&level=1&stage=1`);

    expect((await (await resumed).json()).record).toMatchObject({nextUnit:1,settings:confirmedProgress.settings,activeMs:confirmedProgress.activeMs});
    await expect(page.getByText("Hello 2.", { exact: true })).toBeVisible();
    await test.step("an uncommitted operation stays in RAM and warns before exit", async () => {
      await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
      await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
      await page.route("**/api/learner/practice", route => route.request().postDataJSON()?.action === "checkpoint"
        ? route.fulfill({status:503,json:{error:"temporary-error"}}) : route.continue());
      await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
      await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toBeVisible();
      expect((await (await a.context.request.get("/api/learner/practice")).json()).progress).toMatchObject(confirmedProgress);
      await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
      const warning = page.waitForEvent("dialog");
      const exitClick = page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
      const dialog = await warning;
      expect(dialog.message()).toContain("확인되지 않은 저장");
      await dialog.dismiss(); await exitClick;
      await page.unroute("**/api/learner/practice");
      page.once("dialog",dialog => dialog.accept());
      await page.reload();
      // Reload resumes automatically, or explicitly takes over a lost release.
      await enterAccountPractice(page);
      await expect(page.getByText("Hello 2.", { exact: true })).toBeVisible();
      await expect(page.getByRole("group", { name: "완료한 듣기", exact: true })).toContainText("필수 0 / 3");
    });
    await page.getByRole("button", { name: /첫 원음 듣기/ }).click();
    for (let cycle = 1; cycle <= 3; cycle++) {
      await expect(page.getByRole("button", { name: /듣기 완료 확인/ })).toBeVisible();
      await page.getByRole("button", { name: /듣기 완료 확인/ }).click();
      await expect(page.getByRole("group", { name: "완료한 듣기", exact: true })).toContainText(`필수 ${cycle} / 3`);
    }
    await page.route("**/api/learner/practice", async route => {
      if (route.request().postDataJSON()?.kind !== "advance") return route.continue();
      expect((await route.fetch()).status()).toBe(200);
      await route.fulfill({ status: 503, json: { error: "temporary-error" } });
    });
    await page.getByRole("button", { name: /NEXT/ }).click();
    await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toBeVisible();
    await expect(page.getByRole("button", { name: /NEXT/ })).toBeDisabled();
    await page.unroute("**/api/learner/practice");
    await page.getByRole("button", { name: "저장 재시도", exact: true }).click();
    const finishedJournal = await (await b.request.get("/api/learner/practice")).json();
    expect(finishedJournal.progress).toBeNull();
    expect(finishedJournal.history).toHaveLength(1);
    expect(finishedJournal.studyDays).toHaveLength(1);
    await page.getByRole("button",{name:"레슨 목록으로",exact:true}).click();
    await expect(page).toHaveURL(/\/lessons\?/);
    const map = await b.newPage();
    await map.goto(`/lessons/${lessonId}/stages`);
    await expect(map.getByText("완료 1 / 16", { exact: true })).toBeVisible();
    await expect(map.getByLabel("1일 연속 학습")).toBeVisible();
    await map.getByRole("button", { name: "이 레슨의 완료 기록" }).click();
    await expect(map.getByRole("table", { name: "이 레슨의 완료 기록" })).toContainText("스테이지 1");
    await map.screenshot({ path: testInfo.outputPath("cloud-completion-history.png"), fullPage: true });
    expect(errors).toEqual([]);

    await test.step("expired offline owner cannot overwrite the next device", async () => {
      const starting = page.waitForResponse(response => response.url().endsWith("/api/learner/practice") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "start");
      await page.goto(`/player?lesson=${lessonId}&level=1&stage=2`);

      const oldStart = await starting, oldBody = oldStart.request().postDataJSON(), oldLease = await oldStart.json();
      expect(oldStart.status()).toBe(200);
      await page.context().setOffline(true);
      await map.goto(`/player?lesson=${lessonId}&level=1&stage=2`);

      await expect(map.getByRole("button", { name: "이 기기에서 이어 학습", exact: true })).toBeVisible();
      await waitForLeaseExpiry(a.id);
      const takeover = map.waitForResponse(response => response.url().endsWith("/api/learner/practice") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "start");
      await map.reload();

      expect((await takeover).status()).toBe(200);
      await expect(map.getByText("Hello 1.", { exact: true })).toBeVisible();
      await page.context().setOffline(false);
      expect((await a.context.request.post("/api/learner/practice", { data: { action: "checkpoint",accountId: a.id,instance:oldBody.instance,runId:oldLease.record.runId,generation:oldLease.generation,
        operation:randomUUID(),revision:0,kind:"studied",nextUnit:0,activeMs:2000 } })).status()).toBe(409);
      await map.context().clearCookies();
      await map.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(map.getByRole("button", {name:"로그인",exact:true})).toBeVisible();
      await expect(map.getByText("Hello 1.",{exact:true})).toHaveCount(0);
    });
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    for (const id of users) await service.auth.admin.deleteUser(id);
  }
});
