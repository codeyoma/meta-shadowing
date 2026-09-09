import { randomUUID } from "node:crypto";
import { test, expect, lessonIds } from "./fixtures/cloud-ui";
import { openLearnerPage, readServerJournal } from "./fixtures/cloud-navigation";
import { auditLearningStorage } from "./fixtures/storage-audit";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";
import { testRecording } from "./fixtures/audio";
import { seedServerJournal, fixtureVersion } from "./fixtures/cloud-journal";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires disposable local Supabase");
for (const endpoint of ["practice", "preferences"]) {
  test(`cutover read failure: ${endpoint} is not an empty completion history`, async ({ context, page }) => {
    await context.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    const runId = randomUUID();
    await seedServerJournal(page, { history: [{
      runId, lessonId: lessonIds[0], lessonVersion: fixtureVersion, lessonName: "Morning Routine", language: "english",
      level: 1, stage: 1, nextPhrase: 3, nextUnit: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
      completedAt: new Date().toISOString(),
    }] });
    const access = await auditLearningStorage(context);
    const route = `**/api/learner/${endpoint}*`;
    await page.route(route, request => request.fulfill({ status: 503, json: { error: "temporary-error" } }));
    await page.goto(`/player?lesson=${lessonIds[0]}&level=1&stage=1&run=${runId}`);
    await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toContainText("학습 기록을 불러오지 못했습니다.");
    await expect(page.getByRole("button", { name: /CONTINUE/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "레슨 목록으로", exact: true })).toHaveCount(0);
    expect((await readServerJournal(page)).history).toHaveLength(1);
    await page.unroute(route);
    await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
    await expect(page.getByRole("button", { name: "레슨 목록으로", exact: true })).toBeVisible();
    expect((await readServerJournal(page)).history).toHaveLength(1);
    expect(access).toEqual([]);
  });
}
for (const level of [1,2,3,4,5,6,7,8]) for (const committed of [false, true]) {
  test(`cutover level ${level}: failed jump, takeover, background return and isolated account (committed=${committed})`, async ({ context: a, page, browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }) => {
    test.setTimeout(60000);
    await a.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    const b = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, storageState: { cookies: await a.cookies(), origins: [] } });
    const c = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent });
    const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
    const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
    const email = `cutover-c-${randomUUID()}@example.com`, password = randomUUID();
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull(); const cId = created.data.user!.id;
    const client = createClient(url, key, options);
    const clientCookies = createServerClient(url, key, { cookies: { getAll: () => [], setAll: async values => {
      await c.addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const })));
    } } });
    let release = () => {};
    try {
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      await clientCookies.auth.setSession(await promoteLocalSessionToGoogle(url, service, client, cId, "learner"));
      await c.request.post("/api/auth", { data: { password: "integration-beta-password" } });
      const access = [await auditLearningStorage(a), await auditLearningStorage(b), await auditLearningStorage(c)];
      for (const context of [a,b,c]) await context.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
      const href = `/player?lesson=${lessonIds[1]}&level=${level}&stage=${level*2-1}`;
      const starting = page.waitForResponse(response => response.url().endsWith("/api/learner/practice") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "start");
      await openLearnerPage(page, href);
      const start = await starting, lease = await start.json();
      const ownership = { accountId: lease.accountId, instance: start.request().postDataJSON().instance, runId: lease.record.runId, generation: lease.generation };
      let checkpoint: Record<string, unknown> | undefined;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/learner/practice", async route => {
        const command = route.request().method() === "POST" ? route.request().postDataJSON() : null;
        if (command?.action !== "checkpoint") return route.fallback();
        checkpoint = command;
        if (committed) {
          const response = await route.fetch(); expect(response.status()).toBe(200);
          await held; await route.fulfill({ response });
        } else await route.fulfill({ status: 503, json: { error: "temporary-error" } });
      });
      await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
      await page.getByRole("button", { name: "문장 목록", exact: true }).click();
      await page.getByRole("button", { name: /We sit at the table/ }).click();
      await expect.poll(() => Boolean(checkpoint)).toBe(true);
      if (!committed) await expect(page.getByRole("button", { name: "저장 재시도", exact: true })).toBeVisible();
      const nextUnit = committed ? (level === 4 || level === 5 ? 1 : 2) : 0;
      await expect.poll(async () => (await readServerJournal(page)).progress.nextUnit).toBe(nextUnit);
      const confirmed = await readServerJournal(page);
      await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "0");
      const second = await b.newPage(); await second.goto(href);
      await second.getByRole("button", { name: "이 기기에서 이어 학습", exact: true }).click();
      await second.getByRole("button", { name: "이어 학습 확인", exact: true }).click();
      await expect(second.getByRole("button", { name: /CONTINUE/ })).toBeVisible();
      release();
      if (!committed) {
        await page.unroute("**/api/learner/practice");
        await page.getByRole("button", { name: "저장 재시도", exact: true }).click();
      }
      await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toContainText("다른 기기");
      await expect(page.getByRole("button", { name: /CONTINUE/, includeHidden: true })).toBeDisabled();
      expect((await a.request.post("/api/learner/practice", { data: checkpoint })).status()).toBe(409);
      expect((await c.request.post("/api/learner/practice", { data: { action: "renew", ...ownership } })).status()).toBe(409);
      expect((await readServerJournal(second)).progress).toEqual(confirmed.progress);

      await second.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(second.getByRole("button", { name: "학습 연결 확인", exact: true })).toBeVisible();
      await second.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(second.getByRole("button", { name: "학습 연결 확인", exact: true })).toHaveCount(0);
      expect((await readServerJournal(second)).progress).toEqual(confirmed.progress);

      const third = await c.newPage(); await third.goto(`/lessons/${lessonIds[1]}/stages`);
      await third.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
      await expect(third.getByRole("dialog")).toContainText("아직 완료한 학습이 없습니다.");
      expect(await readServerJournal(third)).toMatchObject({ accountId: cId, progress: null, history: [], studyDays: [] });
      await third.keyboard.press("Escape");
      await third.goto("/settings");
      await third.getByRole("button", { name: "로그아웃", exact: true }).click();
      await expect(third).toHaveURL(/\/login$/);
      await expect(third.getByRole("button", { name: "이 레슨의 완료 기록", exact: true })).toHaveCount(0);
      expect((await c.request.get("/api/learner/practice")).status()).toBe(401);
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      await clientCookies.auth.setSession((await client.auth.getSession()).data.session!);
      await third.goto("/settings/session");
      await expect(third.getByLabel("재생속도")).toHaveValue("1");
      expect(access.flat()).toEqual([]);
    } finally {
      release(); await b.close(); await c.close(); await service.auth.admin.deleteUser(cId);
    }
  });
}
