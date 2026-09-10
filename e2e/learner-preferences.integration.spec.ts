import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || process.env.CLOUD_LEARNING_ENABLED !== "1", "requires isolated cloud-preferences integration");

async function saveSilently(page: Page, action: () => Promise<unknown>) {
  const receipt = page.waitForResponse(response => new URL(response.url()).pathname === "/api/learner/preferences" && response.request().method() === "PATCH");
  await action();
  const response = await receipt;
  expect(response.status()).toBe(200);
  await response.finished();
  await expect(page.getByText(/^(저장 중…|계정에 저장했습니다\. 다음 학습부터 적용됩니다\.)$/)).toHaveCount(0);
  await expect(page.getByRole("alert", { name: "계정 설정 알림" })).toHaveCount(0);
}

test("legacy preference API and selection remain account-isolated for the server player boundary", async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }, testInfo) => {
  test.setTimeout(90000);
  const device = { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent };
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  const users: string[] = [];
  const contexts: BrowserContext[] = [];
  async function account(browser: Browser, google = true) {
    const password = randomUUID();
    const email = `preferences-${randomUUID()}@example.com`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Missing fixture user");
    users.push(created.data.user.id);
    const client = createClient(url, key, options);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    if (!google) await client.auth.updateUser({ data: { provider: "google", providers: ["google"], role: "admin" } });
    const session = google ? await promoteLocalSessionToGoogle(url, service, client, created.data.user.id, "learner")
      : (await client.auth.refreshSession()).data.session!;
    const context = await browser.newContext({ ...device, baseURL, ignoreHTTPSErrors: true, timezoneId: "Asia/Seoul" });
    contexts.push(context);
    const cookieClient = createServerClient(url, key, { cookies: {
      getAll: () => [],
      setAll: async cookies => { await context.addCookies(cookies.map(cookie => ({
        name: cookie.name, value: cookie.value, url: baseURL!, sameSite: "Lax" as const, httpOnly: false,
      }))); },
    } });
    expect((await cookieClient.auth.setSession(session)).error).toBeNull();
    expect((await context.request.post("/api/auth", { data: { password: "integration-beta-password" } })).status()).toBe(200);
    return { context, client, id: created.data.user.id };
  }
  try {
    const a = await account(browser);
    const lessonIds = [randomUUID(), randomUUID(), randomUUID()];
    const catalog = await service.from("lesson_drafts").insert(lessonIds.map((id, index) => ({
      id, created_by: a.id, title: `Account lesson ${index}`, language: index === 0 ? "english" : "japanese",
      target_filename: "target.txt", korean_filename: "korean.txt", target_source: "Hello.", korean_source: "안녕.",
      parsed_entries: [{ kind: "phrase", sourceLine: 1, phraseNumber: 1, target: "Hello.", korean: "안녕." }],
      validation_status: "validated", phrase_count: 1, chapter_count: 0, section_count: 0,
      publication_status: "published", published_at: new Date(Date.now() + index * 1000).toISOString(), audio_manifest: [{}],
    })));
    expect(catalog.error).toBeNull();
    const initial = await a.context.request.get("/api/learner/preferences?timezone=Asia%2FSeoul");
    expect(initial.status()).toBe(200);
    expect((await initial.json()).profile).toMatchObject({ accountId: a.id, overrides: {}, selection: null, studyTimeZone: "Asia/Seoul", revision: 0 });
    const pageA = await a.context.newPage();
    const errors: string[] = [];
    const storageAccesses: string[] = [];
    pageA.on("pageerror", error => errors.push(error.message));
    pageA.on("console", message => { if (message.text().startsWith("cloud-storage-access:")) storageAccesses.push(message.text()); });
    await pageA.addInitScript(() => {
      localStorage.setItem("meta-shadowing:preferences:v1", JSON.stringify({ speed: 3 }));
      localStorage.setItem("meta-shadowing:learning:v1", "existing-record-do-not-import-or-delete");
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key) {
        if (key.startsWith("meta-shadowing:")) {
          console.warn(`cloud-storage-access:read:${key}`);
          throw new Error(`Cloud path read local learning data: ${key}`);
        }
        return original.call(this, key);
      };
      for (const method of ["setItem", "removeItem"] as const) {
        const originalMutation = Storage.prototype[method];
        Storage.prototype[method] = function(key: string, value?: string) {
          if (key.startsWith("meta-shadowing:")) console.warn(`cloud-storage-access:${method}:${key}`);
          return originalMutation.call(this, key, value!);
        };
      }
    });
    const initialProfile = (await (await a.context.request.get("/api/learner/preferences?timezone=Asia%2FSeoul")).json()).profile;
    expect((await a.context.request.patch("/api/learner/preferences", { data: { accountId: a.id, revision: initialProfile.revision, changes: { speed: 2 } } })).status()).toBe(200);
    const b = await browser.newContext({ ...device, baseURL, ignoreHTTPSErrors: true, timezoneId: "America/New_York", storageState: { cookies: await a.context.cookies(), origins: [] } });
    contexts.push(b);
    const pageB = await b.newPage();
    expect((await (await b.request.get("/api/learner/preferences")).json()).profile.overrides.speed).toBe(2);
    const c = await account(browser);
    const pageC = await c.context.newPage();
    expect((await (await c.context.request.get("/api/learner/preferences")).json()).profile.overrides).toEqual({});
    const stored = await service.from("learner_preferences").select("settings, study_timezone").eq("user_id", a.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({ settings: { speed: 2 }, study_timezone: "Asia/Seoul" });

    await test.step("HTTP ownership forgery and direct authenticated DB access are denied", async () => {
      const patch = { accountId: a.id, revision: 0, changes: { speed: 3 } };
      expect((await c.context.request.patch("/api/learner/preferences", { data: patch })).status()).toBe(409);
      expect((await a.context.request.patch("/api/learner/preferences", { data: { ...patch, user_id: c.id } })).status()).toBe(400);
      expect((await a.context.request.patch("/api/learner/preferences", { data: patch, headers: { Origin: "https://example.invalid" } })).status()).toBe(403);
      expect((await c.context.request.get(`/api/learner/preferences?user_id=${a.id}`)).ok()).toBeTruthy();
      expect((await (await c.context.request.get("/api/learner/preferences")).json()).profile.accountId).toBe(c.id);
      expect((await a.client.from("learner_preferences").select("*")).error?.code).toBe("42501");
      expect((await a.client.from("learner_preferences").update({ settings: { speed: 3 } }).eq("user_id", a.id)).error?.code).toBe("42501");
      expect((await a.client.rpc("get_learner_preferences", { p_user_id: c.id, p_timezone: "UTC" })).error?.code).toBe("42501");
      for (const changes of [{ speed: 99 }, { lineGapMs: -1 }, { groupSize: 5 }, { wpmLevel: 2 }, { selection: { language: "english", lessonId: lessonIds[1] } }]) {
        expect((await a.context.request.patch("/api/learner/preferences", { data: { ...patch, changes } })).status()).toBe(400);
      }
      const untrusted = await account(browser, false);
      expect((await untrusted.context.request.get("/api/learner/preferences")).status()).toBe(401);
      expect((await untrusted.context.request.patch("/api/learner/preferences", { data: { ...patch, accountId: untrusted.id } })).status()).toBe(401);
      const parallel = await Promise.all([{ advanceDelayMs: 2000 }, { groupGapMs: 1000 }].map(changes => c.context.request.patch("/api/learner/preferences", { data: { accountId: c.id, revision: 0, changes } })));
      expect(parallel.map(response => response.status())).toEqual([200, 200]);
      expect((await (await c.context.request.get("/api/learner/preferences")).json()).profile.overrides).toEqual({ advanceDelayMs: 2000, groupGapMs: 1000 });
      const newAccount = await account(browser);
      expect((await newAccount.context.request.get("/api/learner/preferences?timezone=Pacific%2FHonolulu", { headers: { "Sec-Fetch-Site": "cross-site", Origin: "https://example.invalid" } })).status()).toBe(403);
      for (const site of ["same-site", "cross-site"]) {
        expect((await newAccount.context.request.get("/api/learner/preferences?timezone=Pacific%2FHonolulu", { headers: { "Sec-Fetch-Site": site } })).status()).toBe(403);
      }
      expect((await service.from("learner_preferences").select("user_id").eq("user_id", newAccount.id)).data).toEqual([]);
    });

    await test.step("last language and non-default lesson persist; refocusing an older URL never writes it back", async () => {
      await pageA.goto("/languages");
      let savedSelection = pageA.waitForResponse(response => response.url().endsWith("/api/learner/preferences") && response.request().method() === "PATCH");
      await pageA.getByRole("link", { name: /일본어/ }).click();
      expect((await savedSelection).status()).toBe(200);
      await expect(pageA.getByLabel("계정 설정 알림")).toHaveCount(0);
      savedSelection = pageA.waitForResponse(response => response.url().endsWith("/api/learner/preferences") && response.request().method() === "PATCH");
      await pageA.getByRole("link", { name: /Account lesson 1/ }).click();
      expect((await (await savedSelection).json()).profile.selection.lessonId).toBe(lessonIds[1]);
      await pageB.goto("/lessons");
      await expect(pageB.getByRole("heading", { name: "일본어 레슨" })).toBeVisible();
      await expect(pageB.getByRole("link", { name: "스테이지", exact: true })).toHaveAttribute("href", `/lessons/${lessonIds[1]}/stages`);
      await saveSilently(pageB, () => pageB.goto(`/lessons/${lessonIds[0]}/stages`));
      const refreshed = pageA.waitForResponse(response => response.url().includes("/api/learner/preferences?") && response.request().method() === "GET");
      await pageA.evaluate(() => window.dispatchEvent(new Event("focus")));
      await refreshed;
      await pageA.waitForLoadState("networkidle");
      const value = await service.from("learner_preferences").select("selection").eq("user_id", a.id).single();
      expect(value.data?.selection).toEqual({ language: "english", lessonId: lessonIds[0] });
      await pageA.goto(`/player?lesson=${lessonIds[0]}`);
      await expect(pageA.getByRole("button", { name: /CONTINUE/ })).toBeVisible();
      await pageA.goto("/languages");
    });

    await test.step("a last-selection conflict displays the server choice and never resaves the rejected URL", async () => {
      await pageA.getByRole("link", { name: "언어", exact: true }).click();
      await pageA.waitForLoadState("networkidle");
      await pageA.route("**/api/learner/preferences", async route => {
        const before = (await (await a.context.request.get("/api/learner/preferences")).json()).profile;
        expect((await a.context.request.patch("/api/learner/preferences", { data: { accountId: a.id, revision: before.revision, changes: { selection: { language: "german", lessonId: null } } } })).status()).toBe(200);
        await route.continue();
      });
      // The preceding scenario can leave the same alert visible. Wait for this
      // request's receipt before removing the route that creates the conflict.
      const conflict = pageA.waitForResponse(response => new URL(response.url()).pathname === "/api/learner/preferences" && response.request().method() === "PATCH");
      await pageA.getByRole("link", { name: /일본어/ }).click();
      expect((await conflict).status()).toBe(409);
      await expect(pageA.getByRole("alert", { name: "계정 설정 알림" })).toContainText("최신 설정");
      await pageA.unroute("**/api/learner/preferences");
      await expect(pageA.getByRole("heading", { name: "독일어 레슨" })).toBeVisible();
      expect((await (await a.context.request.get("/api/learner/preferences")).json()).profile.overrides.speed).toBe(2);
      expect((await (await a.context.request.get("/api/learner/preferences")).json()).profile.selection).toEqual({ language: "german", lessonId: null });
    });

    await test.step("account switches hide stale data before another profile is loaded", async () => {
      await b.clearCookies();
      await b.addCookies(await c.context.cookies());
      await pageB.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(pageB.getByLabel("재생속도")).toHaveCount(0);
      await expect(pageB.getByRole("alert", { name: "계정 설정 알림" })).toContainText("계정이 변경");
      await pageB.getByRole("button", { name: "새 계정 불러오기" }).click();
      // An old account's route parameters must not become the new account's selection.
      await pageB.waitForLoadState("networkidle");
      expect((await (await c.context.request.get("/api/learner/preferences")).json()).profile.selection).toBeNull();
      await expect(pageB.getByLabel("재생속도")).toHaveValue("1");
    });
    expect(await pageA.evaluate(() => ({ ...localStorage }))).toMatchObject({
      "meta-shadowing:preferences:v1": JSON.stringify({ speed: 3 }),
      "meta-shadowing:learning:v1": "existing-record-do-not-import-or-delete",
    });
    expect(errors).toEqual([]);
    expect(storageAccesses).toEqual([]);
    await pageA.screenshot({ path: testInfo.outputPath("account-preferences.png"), fullPage: true });
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    for (const id of users) await service.auth.admin.deleteUser(id);
  }
});
