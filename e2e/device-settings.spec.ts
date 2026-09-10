import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures/cloud-ui";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./fixtures/local-supabase-google";

test("opens the same local settings drawer in place from language, lesson, and stage screens", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  for (const route of [
    "/languages",
    "/lessons?language=english",
    "/lessons/10000000-0000-4000-8000-000000000001/stages",
  ]) {
    await page.goto(route);
    const before = await page.evaluate(() => ({ route: location.pathname + location.search, scroll: scrollY }));
    const trigger = page.getByRole("button", { name: "설정", exact: true });
    await trigger.focus();
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "설정", exact: true });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box?.height).toBe(await page.evaluate(() => innerHeight));
    expect(box?.width).toBeCloseTo(await page.evaluate(() => Math.min(innerWidth, 430)), 2);
    await expect.poll(() => drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
    if (route === "/languages") await page.screenshot({ path: `/tmp/device-settings-open-${testInfo.project.name}.png`, animations: "disabled" });
    await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    expect(await page.evaluate(() => ({ route: location.pathname + location.search, scroll: scrollY }))).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await expect(page.locator("nextjs-portal").getByText(/Build Error|Runtime Error/)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("saves account-scoped settings to IndexedDB across reload without a server write", async ({ page }) => {
  const patches: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/learner/preferences" && request.method() === "PATCH") patches.push(request.url());
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.addInitScript(() => localStorage.setItem("meta-shadowing:preferences:v1", JSON.stringify({ speed: 3 })));
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("재생속도")).toHaveValue("1");
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  await page.getByLabel("재생속도").selectOption("2");
  await expect(page.getByLabel("재생속도")).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("4");
  await expect(page.getByLabel("재생속도")).toHaveValue("2");
  const accountId = (await (await page.request.get("/api/learner/preferences")).json()).profile.accountId;
  expect(await page.evaluate(({ accountId }) => new Promise(resolve => {
    const request = indexedDB.open("meta-shadowing-device-learning-v1");
    request.onsuccess = () => {
      const read = request.result.transaction("accounts").objectStore("accounts").get(accountId);
      read.onsuccess = () => { request.result.close(); resolve(read.result); };
    };
  }), { accountId })).toMatchObject({ schemaVersion: 2, accountId, preferredLevel: 4, settings: { speed: 2 } });
  await page.evaluate(({ databaseName, accountId }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction("accounts", "readwrite");
      transaction.objectStore("accounts").put({ schemaVersion: 1, accountId: `${accountId}-other`, settings: { speed: 3 } });
      transaction.oncomplete = () => { request.result.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), { databaseName: "meta-shadowing-device-learning-v1", accountId });
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("4");
  await expect(page.getByLabel("재생속도")).toHaveValue("2");
  expect(patches).toEqual([]);
});

test("switching authenticated accounts never displays the previous account settings", async ({ page, baseURL }) => {
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const accountAName = await page.locator('[aria-label="Google 계정"] span[title]').innerText();
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  await page.getByLabel("재생속도").selectOption("2");
  await expect(page.getByLabel("재생속도")).toBeEnabled();
  const accountACookies = await page.context().cookies();
  const email = `device-settings-${randomUUID()}@example.com`, password = randomUUID();
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Fixture user missing");
  try {
    const client = createClient(url, key, options);
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const session = await promoteLocalSessionToGoogle(url, service, client, created.data.user.id, "learner");
    const cookieClient = createServerClient(url, key, { cookies: {
      getAll: () => [],
      setAll: async values => { await page.context().addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const }))); },
    } });
    expect((await cookieClient.auth.setSession(session)).error).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeHidden();
    await expect(page.getByLabel("재생속도")).toHaveCount(0);
    await expect(page.getByText("온라인 로그인이 필요합니다.", { exact: true })).toBeVisible();
    await expect(page.getByText(accountAName, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByLabel("학습 레벨")).toHaveValue("1");
    await expect(page.getByLabel("재생속도")).toHaveValue("1");
    await page.context().clearCookies();
    await page.context().addCookies(accountACookies);
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByLabel("학습 레벨")).toHaveValue("4");
    await expect(page.getByLabel("재생속도")).toHaveValue("2");
  } finally {
    await service.auth.admin.deleteUser(created.data.user.id);
  }
});

test("malformed and unsupported account records fail explicitly", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const accountId = (await (await page.request.get("/api/learner/preferences")).json()).profile.accountId;
  await page.goto("/languages");
  for (const record of [
    { schemaVersion: 99, accountId, settings: { speed: 2 } },
    { schemaVersion: 1, accountId, settings: { speed: 99 } },
    { schemaVersion: 1, accountId, preferredLevel: 9, settings: { speed: 2 } },
  ]) {
    await page.evaluate(({ record }) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("meta-shadowing-device-learning-v1");
      request.onupgradeneeded = () => request.result.createObjectStore("accounts", { keyPath: "accountId" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("accounts", "readwrite");
        transaction.objectStore("accounts").put(record);
        transaction.oncomplete = () => { request.result.close(); resolve(); };
      };
    }), { record });
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("기기 설정을 읽거나 저장하지 못했습니다");
  }
});

test("reports a failed IndexedDB write and never sends a settings PATCH", async ({ page }) => {
  const patches: string[] = [];
  page.on("request", request => { if (request.method() === "PATCH" && new URL(request.url()).pathname === "/api/learner/preferences") patches.push(request.url()); });
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      if ((args[0] as { accountId?: string })?.accountId) throw new DOMException("Denied", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("재생속도").selectOption("2");
  await expect(page.getByRole("alert")).toContainText("기기 설정을 읽거나 저장하지 못했습니다");
  expect(patches).toEqual([]);
});

test("opens local settings while the legacy cloud preference read is stalled", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("**/api/learner/preferences?*", () => new Promise(() => {}));
  await page.goto("/languages", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByLabel("재생속도")).toBeEnabled();
});

test("reports denied local storage instead of claiming a memory-only save", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: { open: () => { throw new DOMException("Denied", "SecurityError"); } },
    });
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "기기 설정을 읽거나 저장하지 못했습니다" })).toBeVisible();
  await expect(page.getByLabel("재생속도")).toBeDisabled();
});
