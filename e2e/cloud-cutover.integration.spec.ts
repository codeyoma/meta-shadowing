import { randomUUID } from "node:crypto";
import { test, expect, lessonIds } from "./fixtures/cloud-ui";
import { openLearnerPage, readServerJournal, readDeviceJournal } from "./fixtures/cloud-navigation";
import { auditLearningStorage } from "./fixtures/storage-audit";
import { seedLearningJournal, fixtureVersion } from "./fixtures/cloud-journal";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

test.skip(process.env.ADMIN_SUPABASE_INTEGRATION !== "1", "requires disposable local Supabase");
test("storage audit permits device settings reads but still reports unrelated IndexedDB access", async ({ context, page }) => {
  await context.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const access = await auditLearningStorage(context);
  await page.goto("/settings");
  await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  expect(access).toEqual([]);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("unrelated-learning-database");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  }));
  await expect.poll(() => access).toEqual(["IndexedDB.open:unrelated-learning-database"]);
});

for (const endpoint of ["practice", "preferences"]) {
  test(`unavailable ${endpoint} does not hide a device completion`, async ({ page }) => {
    await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    const runId = randomUUID();
    await seedLearningJournal(page, { history: [{
      runId, lessonId: lessonIds[0], lessonVersion: fixtureVersion, lessonName: "Morning Routine", language: "english",
      level: 2, stage: 3, nextPhrase: 3, nextUnit: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
      completedAt: new Date().toISOString(),
    }] });
    await openLearnerPage(page, `/player?lesson=${lessonIds[0]}&level=2&stage=3&run=${runId}`);
    const reads: string[] = [];
    await page.route(`**/api/learner/${endpoint}*`, route => { reads.push(route.request().url()); return route.abort(); });
    await page.reload();
    await expect(page.getByRole("heading", { name: "레벨 2 학습 완료", exact: true })).toBeVisible();
    expect((await readDeviceJournal(page))!.history.map(run => run.runId)).toEqual([runId]);
    expect(reads).toEqual([]);
  });
}

for (const level of [1,2,3,4,5,6,7,8]) test(`level ${level} failed local jump retries atomically and stays independent from another device`, async ({ page, browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent }) => {
  test.setTimeout(60000);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const href = `/player?lesson=${lessonIds[1]}&level=${level}&stage=${level * 2 - 1}`;
  await openLearnerPage(page, href);
  const initial = (await readDeviceJournal(page))!.runs[0];
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "accounts") throw new DOMException("Fixture quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
    window.addEventListener("restore-storage", () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /We sit at the table/ }).click();
  await expect(page.getByRole("button", { name: "기기 저장 재시도", exact: true })).toBeVisible();
  expect((await readDeviceJournal(page))!.runs[0]).toEqual(initial);
  await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "0");
  const other = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent,
    storageState: { cookies: await page.context().cookies(), origins: [] } });
  try {
    const second = await other.newPage();
    await openLearnerPage(second, href);
    const independent = (await readDeviceJournal(second))!.runs[0];
    expect(independent.runId).not.toBe(initial.runId);
    expect(independent.nextUnit).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event("restore-storage")));
    await page.getByRole("button", { name: "기기 저장 재시도", exact: true }).click();
    await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", level === 4 || level === 5 ? "1" : "2");
    await page.reload();
    const saved = (await readDeviceJournal(page))!;
    expect(saved.runs[0]).toMatchObject({ runId: initial.runId, nextPhrase: 2, revision: 1 });
    expect(saved.studyDays).toEqual([]);
    expect((await readDeviceJournal(second))!.runs[0]).toEqual(independent);
    expect(await readServerJournal(page)).toMatchObject({ progress: null, history: [] });
  } finally { await other.close(); }
});
