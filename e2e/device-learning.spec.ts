import { expect, test } from "./fixtures/cloud-ui";
import { openLearnerPage } from "./fixtures/cloud-navigation";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";
import { loadPackageModules } from "./fixtures/package-store";
import { auditLearningStorage } from "./fixtures/storage-audit";
import type { BrowserContext } from "@playwright/test";
import { seedServerJournal, fixtureVersion } from "./fixtures/cloud-journal";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

// Chromium's context offline emulation does not reliably cover worker-origin fetch.
// Isolate that network boundary too; production worker/cache/application logic is real.
async function setDeviceOffline(context: BrowserContext, offline: boolean) {
  for (const worker of context.serviceWorkers()) await worker.evaluate(offline => {
    const scope = globalThis as typeof globalThis & { fixtureOnlineFetch?: typeof fetch };
    if (offline) {
      scope.fixtureOnlineFetch ??= scope.fetch;
      scope.fetch = async () => { throw new TypeError("Fixture worker network offline"); };
    } else if (scope.fixtureOnlineFetch) scope.fetch = scope.fixtureOnlineFetch;
  }, offline);
  await context.setOffline(offline);
}

const player = "/player?lesson=10000000-0000-4000-8000-000000000001&level=1";

test("three local confirmations survive reload without progress or audio HTTP", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  const dependencies: string[] = [];
  page.on("request", request => {
    if (/\/api\/learner\/practice|\/api\/lessons\/.*\/audio\//.test(request.url())) dependencies.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/learner/practice**", route => route.abort());
  await page.route("**/api/lessons/*/audio/**", route => route.abort());
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  for (let count = 1; count <= 3; count++) {
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${count} / 3`);
  }
  await page.reload();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3");
  await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  expect(dependencies).toEqual([]);
});

test("quota failure holds the phrase until the same local save succeeds", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (let count = 1; count <= 3; count++) await confirmManualListen(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "accounts") throw new DOMException("Fixture quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
    window.addEventListener("restore-storage", () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "기기에 학습을 저장하지 못했습니다." })).toBeVisible();
  await expect(page.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true, includeHidden: true })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("restore-storage")));
  await page.getByRole("button", { name: "기기 저장 재시도" }).click();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
});

test("completion is durable, deduplicated by run, and appears on the local stage path", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  for (let phrase = 0; phrase < 3; phrase++) {
    await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
    for (let cycle = 1; cycle <= 3; cycle++) await confirmManualListen(page);
    await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "레벨 1 학습 완료" })).toBeVisible();
  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    await expect(page.getByRole("heading", { name: "레벨 1 학습 완료" })).toBeVisible();
  }
  await loadPackageModules(page);
  const record = await page.evaluate(async () => {
    const access = JSON.parse(localStorage.getItem("meta-shadowing:device-access:v1")!);
    return window.deviceStore.readDeviceLearningRecord(access.accountId);
  });
  expect(record?.history).toHaveLength(1);
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  await expect(page.getByRole("progressbar", { name: "완료한 스테이지" })).toHaveAttribute("aria-valuenow", "1");
});

test("a cold offline reload boots the neutral shell and restores the confirmed local phrase", async ({ page, context }, testInfo) => {
  const issues: string[] = [];
  page.on("pageerror", error => issues.push(error.message));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await confirmManualListen(page);
  await page.getByRole("button", { name: /PAUSE/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  await setDeviceOffline(context, true);
  page.on("console", message => { if (["warning", "error"].includes(message.type())) issues.push(`${message.type()}: ${message.text()}`); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
  await expect(page).toHaveTitle("Meta Shadowing");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await expect(page.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 2 / 3");
  await page.screenshot({ path: `/tmp/ticket29-offline-${testInfo.project.name}.png` });
  await expect(page.locator("nextjs-portal").getByText(/Build Error|Runtime Error/)).toHaveCount(0);
  expect(issues).toEqual([]);
});

test("network rejection preserves prior access but explicit 401 and 403 fence it", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  const response = await page.request.get("/api/learner/local-access");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(Object.keys(await response.json())).toEqual(["accountId"]);
  await page.route("**/api/learner/local-access", route => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  for (const status of [401, 403]) {
    await page.unroute("**/api/learner/local-access");
    await page.route("**/api/learner/local-access", route => route.fulfill({ status, json: { error: "unauthorized" } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다." })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("meta-shadowing:device-access:v1"))).toBeNull();
    if (status === 401) {
      await page.unroute("**/api/learner/local-access"); await page.reload();
      await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
    }
  }
});

test("offline logout removes access and retains inaccessible local records", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: /CONTINUE/ }).click(); await confirmManualListen(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  await page.goto("/offline");
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
  const accountId = await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:device-access:v1")!).accountId as string);
  await setDeviceOffline(context, true);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "로그아웃", exact: true }).click(),
  ]);
  await expect(page.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다." })).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto(player);
  await expect(page.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
  await expect(page.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다." })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  await setDeviceOffline(context, false);
  await loadPackageModules(page);
  expect((await page.evaluate(accountId => window.deviceStore.readDeviceLearningRecord(accountId), accountId))?.runs[0].confirmedCycles).toBe(1);
  expect((await page.request.get("/api/learner/local-access")).status()).toBe(401);
});

test("storage denial never creates an in-memory learning session", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, version) {
      if (name === "meta-shadowing-device-learning-v1") throw new DOMException("Denied", "SecurityError");
      return original.call(this, name, version);
    };
  });
  await page.goto(player);
  await page.getByRole("group", { name: "Morning Routine 다운로드" }).getByRole("button", { name: "Morning Routine 다운로드", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "기기에 학습을 저장하지 못했습니다." })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("online logout with an unavailable remote endpoint cannot resurrect local access", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await openLearnerPage(page, "/settings");
  await context.route("**/auth/v1/logout**", route => route.fulfill({ status: 503, json: { error: "fixture unavailable" } }));
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/learner/local-access")).status()).toBe(401);
  await page.goto("/offline");
  await expect(page.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다." })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("meta-shadowing:device-access:v1"))).toBeNull();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("static cache excludes authenticated documents, RSC, APIs and credentials", async ({ page, context, browser, baseURL }) => {
  const accesses = await auditLearningStorage(context);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  const neutral = await page.request.get("/offline");
  expect(neutral.headers()["set-cookie"]).toBeUndefined();
  const accountId = (await (await page.request.get("/api/learner/local-access")).json()).accountId;
  expect(await neutral.text()).not.toContain(accountId);
  // Audit only exact allowed keys, then exercise negative controls separately.
  expect(accesses).toEqual([]);
  const cache = await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith("meta-shadowing-offline-shell-v1-"))!;
    const stored = await caches.open(name);
    return { paths: (await stored.keys()).map(request => new URL(request.url).pathname), html: await (await stored.match("/offline"))!.text() };
  });
  expect(cache.paths.length).toBeGreaterThan(5);
  expect(cache.paths.every(path => path === "/offline" || path === "/offline-assets" || /^\/_next\/static\/.+\.(js|css|woff2?|ttf|otf)$/.test(path))).toBe(true);
  expect(cache.html).not.toContain(accountId);
  expect(cache.html).not.toContain("I wake up at seven.");
  await page.evaluate(() => localStorage.setItem("meta-shadowing:device-access:v1-unapproved", "negative-control"));
  expect(accesses).toContain("Storage.setItem:meta-shadowing:device-access:v1-unapproved");
  const empty = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    const fresh = await empty.newPage();
    await fresh.goto("/offline");
    await expect.poll(() => fresh.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
    await setDeviceOffline(empty, true); await fresh.reload();
    await expect(fresh.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
    await expect(fresh.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다." })).toBeVisible();
    await expect(fresh.locator("audio")).toHaveCount(0);
  } finally { await empty.close(); }
});

test("missing shell assets show a recoverable offline page", async ({ page, context }) => {
  await page.goto("/offline");
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith("meta-shadowing-offline-shell-v1-"))!;
    const cache = await caches.open(name), requests = await cache.keys();
    await cache.delete(requests.find(request => request.url.endsWith(".js"))!);
  });
  await setDeviceOffline(context, true); await page.reload();
  await expect(page.getByRole("heading", { name: "오프라인 화면을 불러올 수 없습니다." })).toBeVisible();
});

test("atomic settings updates preserve progress and deduplicated completion, and stale account epochs cannot write", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await loadPackageModules(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const before = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    const run = before.runs[0];
    const wrongAccount = await window.deviceStore.writeDeviceLearningSettings("another-account", 1, {}, access).then(() => "accepted", () => "fenced");
    const next = { ...run, nextUnit: 1, nextPhrase: 1, confirmedCycles: 0 };
    await Promise.all([
      window.deviceStore.saveDeviceRun(access, next, run.revision),
      window.deviceStore.writeDeviceLearningSettings(access.accountId, 1, { speed: 2 }, access),
    ]);
    const saved = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    const finish = { ...saved.runs[0], nextUnit: 3, nextPhrase: 3, completedAt: "2026-09-10T00:00:00.000Z" };
    await window.deviceStore.saveDeviceRun(access, finish, finish.revision);
    await window.deviceStore.saveDeviceRun(access, finish, finish.revision);
    await window.deviceStore.writeDeviceLearningSettings(access.accountId, 2, { speed: 3 }, access);
    const completed = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    window.deviceAccess.clearDeviceAccess();
    const stale = await window.deviceStore.saveDeviceRun(access, next, next.revision).then(() => "accepted", () => "fenced");
    const staleSettings = await window.deviceStore.writeDeviceLearningSettings(access.accountId, 8, {}, access).then(() => "accepted", () => "fenced");
    return { phrase: saved.runs[0].nextPhrase, speed: saved.settings.speed, history: completed.history.length,
      finalSpeed: completed.settings.speed, preservedRun: completed.history[0].runId === run.runId, stale, staleSettings, wrongAccount };
  });
  expect(result).toEqual({ phrase: 1, speed: 2, history: 1, finalSpeed: 3, preservedRun: true, stale: "fenced", staleSettings: "fenced", wrongAccount: "fenced" });
});

test("schema one settings upgrade when learning starts without importing cloud progress", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("meta-shadowing:device-access:v1")))).toBe(true);
  await loadPackageModules(page);
  await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("meta-shadowing-device-learning-v1");
      open.onupgradeneeded = () => open.result.createObjectStore("accounts", { keyPath: "accountId" });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("accounts", "readwrite");
        tx.objectStore("accounts").put({ schemaVersion: 1, accountId: access.accountId, preferredLevel: 4, settings: { speed: 2 } });
        tx.oncomplete = () => { open.result.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.getByText("수동 · 2×")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
});

test("two browser profiles learn independently with distinct durable run identities", async ({ page, context, browser, baseURL }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const second = await browser.newContext({ storageState: await context.storageState(), baseURL, ignoreHTTPSErrors: true });
  try {
    const other = await second.newPage();
    for (const target of [page, other]) {
      await openLearnerPage(target, player);
      await target.getByRole("button", { name: /CONTINUE/ }).click();
      await confirmManualListen(target);
      await expect(target.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
    }
    expect(new URL(page.url()).searchParams.get("run")).not.toBe(new URL(other.url()).searchParams.get("run"));
    await page.reload();
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
    await expect(other.getByRole("button", { name: "이 기기에서 이어 학습", exact: true })).toHaveCount(0);
  } finally { await second.close(); }
});

test("cross-tab verified account switching tears down A's active offline shell before B can read or write", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: /CONTINUE/ }).click(); await confirmManualListen(page);
  const accountA = await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:device-access:v1")!).accountId as string);
  const pinned = new URL(page.url()); pinned.pathname = "/offline";
  await page.goto(pinned.pathname + pinned.search);
  await expect(page.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  const tab = await context.newPage();
  try {
    await tab.goto("/offline");
    await loadPackageModules(tab);
    // The authenticated response is the approved identity system boundary; the
    // browser's shared storage events, providers and package grants remain real.
    await tab.route("**/api/learner/local-access", route => route.fulfill({ json: { accountId: "verified-account-b" } }));
    await tab.evaluate(() => window.deviceAccess.verifyDeviceAccess("verified-account-b"));
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.getByText("I wake up at seven.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("학습 가능한 전체 레슨이 없습니다. 온라인에서 다운로드해 주세요.", { exact: true })).toBeVisible();
    await loadPackageModules(page);
    const records = await page.evaluate(async accountA => ({
      a: await window.deviceStore.readDeviceLearningRecord(accountA),
      b: await window.deviceStore.readDeviceLearningRecord("verified-account-b"),
    }), accountA);
    expect(records.a?.runs[0].confirmedCycles).toBe(1);
    expect(records.b).toBeNull();
  } finally { await tab.close(); }
});

for (const operation of ["delete", "revoke"] as const) test(`cold-shell package ${operation} from another tab stops playback and preserves the last checkpoint`, async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: /CONTINUE/ }).click(); await confirmManualListen(page);
  const other = await context.newPage();
  try {
    await other.goto("/offline"); await loadPackageModules(other);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
    await setDeviceOffline(context, true); await page.reload();
    await expect(page.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
    await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.loop = true; });
    await page.getByRole("button", { name: /CONTINUE/ }).click();
    await expect(page.locator("audio")).toHaveJSProperty("paused", false);
    await other.evaluate(async operation => {
      const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
      if (operation === "delete") await window.packageStore.deleteLessonPackage("10000000-0000-4000-8000-000000000001");
      else await window.packageStore.invalidatePackageAccount(access.accountId, true);
    }, operation);
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /CONTINUE|NEXT|PAUSE/ })).toHaveCount(0);
    const record = await other.evaluate(() => window.deviceStore.readDeviceLearningRecord(window.deviceAccess.readDeviceAccess()!.accountId));
    expect(record?.runs[0].confirmedCycles).toBe(1);
    expect(record?.runs[0].nextPhrase).toBe(0);
  } finally { await other.close(); }
});

test("cold-shell ordinary focus refresh preserves the installed media identity and confirmed cycles", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, player);
  await page.getByRole("button", { name: /CONTINUE/ }).click(); await confirmManualListen(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
  await setDeviceOffline(context, true); await page.reload();
  await expect(page.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.loop = true; audio.dataset.identity = "retained"; });
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  const source = await page.locator("audio").getAttribute("src");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.15);
  await expect(page.locator("audio")).toHaveAttribute("data-identity", "retained");
  await expect(page.locator("audio")).toHaveAttribute("src", source!);
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("stage resume retains old and current local runs and ignores legacy cloud progress", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.type()); });
  const stages = "/lessons/10000000-0000-4000-8000-000000000001/stages";
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, stages); await loadPackageModules(page);
  const runs = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const inventory = await window.packageStore.listLessonPackages(access.accountId);
    const pack = await window.packageStore.readLessonPackage(access.accountId, inventory[0].lessonId, inventory[0].version);
    const lesson = pack!.manifest.lesson;
    await window.deviceStore.startDeviceRun(access, { ...lesson, version: "2026-08-01T00:00:00Z" }, 1);
    const second = await window.deviceStore.startDeviceRun(access, lesson, 2);
    await window.deviceStore.saveDeviceRun(access, { ...second, nextPhrase: 2, nextUnit: 2 }, second.revision);
    const first = await window.deviceStore.startDeviceRun(access, lesson, 1);
    await window.deviceStore.saveDeviceRun(access, { ...first, nextPhrase: 1, nextUnit: 1 }, first.revision);
    return { first: first.runId, second: second.runId };
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toContainText("이어서 학습");
  await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`run=${runs.first}`));
  await seedServerJournal(page, { progress: { runId: "legacy-resume", lessonId: "10000000-0000-4000-8000-000000000001",
    lessonVersion: fixtureVersion, lessonName: "Morning Routine", language: "english", level: 3, stage: 5,
    nextPhrase: 1, nextUnit: 1, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS } });
  await page.goto(stages);
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toContainText("이어서 학습");
  await expect(page.getByRole("button", { name: "현재 스테이지 5 시작", exact: true })).toHaveCount(0);
  for (const stage of [1, 2]) {
    await page.getByRole("radio", { name: `${stage} 자막 쉐도잉 Lv 1`, exact: true }).click();
    await expect(page.getByRole("dialog").filter({ hasText: `저장된 학습 · 프레이즈 ${stage + 1}` })).toBeVisible();
    if (stage === 2) await page.screenshot({ path: info.outputPath("local-stage-resume.png"), animations: "disabled", scale: "css" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.goto(`${stages}?stage=2`);
  await expect(page.getByRole("button", { name: "현재 스테이지 2 시작", exact: true })).toContainText("이어서 학습");
  await page.getByRole("button", { name: "현재 스테이지 2 시작", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`run=${runs.second}`));
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "2");
  expect(errors).toEqual([]);
});
