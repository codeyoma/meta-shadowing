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

test("account settings synchronize across browsers without sharing another account's preferences", async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }, testInfo) => {
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
    await pageA.goto("/settings/session");
    await expect(pageA.getByLabel("재생속도")).toBeEnabled();
    await saveSilently(pageA, () => pageA.getByLabel("재생속도").selectOption("2"));
    const b = await browser.newContext({ ...device, baseURL, ignoreHTTPSErrors: true, timezoneId: "America/New_York", storageState: { cookies: await a.context.cookies(), origins: [] } });
    contexts.push(b);
    const pageB = await b.newPage();
    await pageB.goto("/settings/session");
    await expect(pageB.getByLabel("재생속도")).toHaveValue("2");
    const c = await account(browser);
    const pageC = await c.context.newPage();
    await pageC.goto("/settings/session");
    await expect(pageC.getByLabel("재생속도")).toHaveValue("1");
    const stored = await service.from("learner_preferences").select("settings, study_timezone").eq("user_id", a.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({ settings: { speed: 2 }, study_timezone: "Asia/Seoul" });

    await test.step("independent edits merge; same-field conflicts display the latest value", async () => {
      // B retains revision 1 while A edits speed. No tab-focus refresh is dispatched here.
      await saveSilently(pageA, () => pageA.getByLabel("재생속도").selectOption("2.5"));
      await saveSilently(pageB, () => pageB.getByRole("radio", { name: "자동", exact: true }).click());
      await expect(pageB.getByLabel("재생속도")).toHaveValue("2.5");
      await saveSilently(pageA, () => pageA.getByLabel("재생속도").selectOption("3"));
      await pageB.getByLabel("재생속도").selectOption("1.5");
      await expect(pageB.getByRole("alert", { name: "계정 설정 알림" })).toContainText("최신 설정");
      await expect(pageB.getByLabel("재생속도")).toHaveValue("3");
      await saveSilently(pageB, () => pageB.getByLabel("재생속도").selectOption("1.5"));
    });

    await test.step("failed reads and writes stay explicit and can be retried", async () => {
      await pageB.route("**/api/learner/preferences*", route => route.fulfill({ status: 503, json: { error: "test-unavailable" } }));
      await pageB.reload();
      await expect(pageB.getByRole("alert", { name: "계정 설정 알림" })).toContainText("불러오지 못했습니다");
      await expect(pageB.getByLabel("재생속도")).toHaveCount(0);
      await pageB.unroute("**/api/learner/preferences*");
      await pageB.getByRole("button", { name: "다시 불러오기" }).click();
      await expect(pageB.getByLabel("재생속도")).toHaveValue("1.5");
      await pageB.route("**/api/learner/preferences", route => route.fulfill({ status: 503, json: { error: "test-unavailable" } }));
      await pageB.getByLabel("재생속도").selectOption("1.75");
      await expect(pageB.getByRole("alert", { name: "계정 설정 알림" })).toContainText("저장을 확인하지 못했습니다");
      await expect(pageB.getByText(/계정에 저장했습니다/)).toHaveCount(0);
      await pageB.unroute("**/api/learner/preferences");
      await saveSilently(pageB, () => pageB.getByRole("button", { name: "저장 재시도" }).click());
      await expect(pageB.getByLabel("재생속도")).toHaveValue("1.75");
    });

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

    await test.step("a lost save acknowledgement can be retried without a second revision", async () => {
      await pageB.route("**/api/learner/preferences", async route => {
        expect((await route.fetch()).status()).toBe(200);
        await route.fulfill({ status: 503, json: { error: "lost-acknowledgement" } });
      });
      await pageB.getByLabel("재생속도").selectOption("1.25");
      await expect(pageB.getByRole("alert", { name: "계정 설정 알림" })).toContainText("저장을 확인하지 못했습니다");
      const before = (await (await a.context.request.get("/api/learner/preferences")).json()).profile;
      await pageB.unroute("**/api/learner/preferences");
      await saveSilently(pageB, () => pageB.getByRole("button", { name: "저장 재시도" }).click());
      expect((await (await a.context.request.get("/api/learner/preferences")).json()).profile.revision).toBe(before.revision);
    });

    await test.step("untouched fields inherit admin defaults, including group and rapid controls", async () => {
      const original = await service.from("session_defaults").select("settings").eq("id", true).single();
      expect(original.error).toBeNull();
      try {
        expect((await service.from("session_defaults").update({ settings: { ...original.data!.settings, speed: 2.25, groupSize: 3, wpmLevel: 5 } }).eq("id", true)).error).toBeNull();
        await pageB.reload();
        await expect(pageB.getByLabel("재생속도")).toHaveValue("1.25");
        await pageB.getByLabel("학습 레벨").selectOption("4");
        await expect(pageB.getByLabel("묶음 크기", { exact: true })).toHaveValue("3");
        async function saved(action: () => Promise<unknown>) {
          await saveSilently(pageB, action);
        }
        await saved(() => pageB.getByLabel("묶음 크기", { exact: true }).selectOption("4"));
        await saved(() => pageB.getByLabel("묶음 원음 간격 (초)").fill("2"));
        await pageB.getByLabel("학습 레벨").selectOption("7");
        await expect(pageB.getByLabel("단어 속도")).toHaveValue("5");
        await saved(() => pageB.getByLabel("단어 속도").selectOption("6"));
        await saved(() => pageB.getByRole("radio", { name: "누적 단어" }).click());
        await saved(() => pageB.getByLabel("말하기 추가 시간 (초)").fill("1.5"));
        await saved(() => pageB.getByLabel("문장 간격 (초)").fill("2"));
        await saved(() => pageB.getByLabel("구간 간격 (초)").fill("3"));
        const profile = (await (await a.context.request.get("/api/learner/preferences")).json()).profile;
        expect(profile.overrides).toMatchObject({ speed: 1.25, groupSize: 4, groupGapMs: 2000, wpmLevel: 6, display: "cumulative", speakingExtraMs: 1500, lineGapMs: 2000, sectionGapMs: 3000 });
      } finally {
        await service.from("session_defaults").update({ settings: original.data!.settings }).eq("id", true);
      }
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
      await pageA.goto("/settings/session");
    });

    await test.step("client route entry refreshes settings while focus preserves account-local UI state", async () => {
      await pageA.getByRole("link", { name: "언어", exact: true }).click();
      const before = (await (await a.context.request.get("/api/learner/preferences")).json()).profile;
      expect((await a.context.request.patch("/api/learner/preferences", { data: { accountId: a.id, revision: before.revision, changes: { speed: 2.75, selection: { language: "german", lessonId: null } } } })).status()).toBe(200);
      await pageA.getByRole("link", { name: "설정", exact: true }).click();
      await pageA.getByRole("link", { name: "세션 설정", exact: true }).click();
      await expect(pageA.getByLabel("재생속도")).toHaveValue("2.75");
      expect((await (await a.context.request.get("/api/learner/preferences")).json()).profile.selection).toEqual({ language: "german", lessonId: null });
      await pageA.getByLabel("학습 레벨").selectOption("7");
      const navigation = pageA.getByRole("navigation", { name: "하단 탐색" });
      await navigation.evaluate(el => el.setAttribute("data-persistent-proof", "yes"));
      const content = pageA.getByRole("region", { name: "세션 설정 항목" });
      await content.evaluate(el => { el.scrollTop = 100; });
      const scrollTop = await content.evaluate(el => el.scrollTop);
      let release!: () => void;
      const hold = new Promise<void>(resolve => { release = resolve; });
      await pageA.route("**/api/learner/preferences?*", async route => { await hold; await route.continue(); });
      const response = pageA.waitForResponse(response => response.url().includes("/api/learner/preferences?") && response.request().method() === "GET");
      await pageA.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(pageA.getByText("계정 설정을 불러오는 중…")).toHaveCount(0);
      await expect(pageA.getByLabel("학습 레벨")).toBeVisible();
      await expect(pageA.getByLabel("학습 레벨")).toBeDisabled();
      await expect(navigation).toHaveAttribute("data-persistent-proof", "yes");
      release();
      await response;
      await pageA.unroute("**/api/learner/preferences?*");
      await expect(pageA.getByLabel("학습 레벨")).toBeVisible();
      await expect(pageA.getByLabel("학습 레벨")).toHaveValue("7");
      await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(scrollTop);
      await expect(navigation).toHaveAttribute("data-persistent-proof", "yes");
    });

    await test.step("selection intent keeps the revision the user saw before a route refetch", async () => {
      await pageA.getByRole("link", { name: "언어", exact: true }).click();
      await expect(pageA.getByRole("heading", { name: "언어 선택", exact: true })).toBeVisible();
      // The page remains visible during background refresh. Settle that read
      // before making the deliberately unseen change from another device.
      await pageA.waitForLoadState("networkidle");
      const before = (await (await a.context.request.get("/api/learner/preferences")).json()).profile;
      const latestSelection = { language: "english", lessonId: lessonIds[0] };
      expect((await a.context.request.patch("/api/learner/preferences", { data: { accountId: a.id, revision: before.revision, changes: { selection: latestSelection } } })).status()).toBe(200);
      await pageA.getByRole("link", { name: /일본어/ }).click();
      await expect(pageA.getByRole("alert", { name: "계정 설정 알림" })).toContainText("최신 설정");
      await expect(pageA.getByRole("heading", { name: "영어 레슨" })).toBeVisible();
      expect((await (await a.context.request.get("/api/learner/preferences")).json()).profile.selection).toEqual(latestSelection);
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
      await pageA.getByRole("link", { name: "설정", exact: true }).click();
      await pageA.getByRole("link", { name: "세션 설정", exact: true }).click();
      await expect(pageA.getByLabel("재생속도")).toHaveValue("2.75");
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
