import { expect, test, lessons } from "./fixtures/cloud-ui";
import { loadPackageModules } from "./fixtures/package-store";

for (const failure of [false, true]) test(`returns focus after delayed confirmation ${failure ? "failure" : "completion"}`, async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  await page.getByRole("button", { name: "계정에 업로드", exact: true }).click();
  await expect(page.getByText("계정에 학습 기록을 업로드했습니다.", { exact: true })).toBeVisible();
  const trigger = page.getByRole("button", { name: "계정에서 다운로드", exact: true });
  await trigger.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.evaluate(failure => {
    // Hold only the external IDB open success event; controller/model/store stay real.
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(...args) {
      IDBFactory.prototype.open = original;
      const request = original.apply(this, args);
      request.addEventListener("success", event => {
        event.stopImmediatePropagation();
        (window as unknown as { releaseSnapshotOpen: () => void }).releaseSnapshotOpen = () => request.dispatchEvent(new Event("success"));
      }, { once: true });
      return request;
    };
    if (failure) {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        IDBObjectStore.prototype.put = put;
        const request = put.apply(this, args); this.transaction.abort(); return request;
      };
    }
  }, failure);
  await page.getByRole("button", { name: "기록 교체", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(trigger).toBeDisabled();
  await page.evaluate(() => (window as unknown as { releaseSnapshotOpen: () => void }).releaseSnapshotOpen());
  await expect(trigger).toBeEnabled();
  await expect(trigger).toBeFocused();
});

test("explicit upload, cancel, replace and local recovery preserve device authority", async ({ page, context }, testInfo) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/learner/snapshot") requests.push(request.method()); });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  await page.evaluate(async lesson => {
    const access = window.deviceAccess.readDeviceAccess()!, store = window.deviceStore;
    const { writer } = await store.readDeviceLearningState(access);
    const run = await store.startDeviceRun(writer, lesson, 1);
    await store.saveDeviceRun(writer, { ...run, nextPhrase: 1, nextUnit: 1 }, run.revision, "2026-09-10");
  }, { ...lessons[0], entries: [], phrases: [] });
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  await page.reload();
  await context.setOffline(true); await context.setOffline(false);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("4");
  expect(requests).toEqual([]);
  const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/learner/snapshot");
  await page.getByRole("button", { name: "계정에 업로드", exact: true }).click();
  expect((await uploadResponse).status()).toBe(200);
  await expect(page.getByText("계정에 학습 기록을 업로드했습니다.", { exact: true })).toBeVisible();
  await page.getByLabel("학습 레벨").selectOption("7");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  const download = page.getByRole("button", { name: "계정에서 다운로드", exact: true });
  await download.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await confirmation.getByRole("button", { name: "취소", exact: true }).click();
  await expect(download).toBeFocused();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("7");
  await download.click();
  await confirmation.getByRole("button", { name: "기록 교체", exact: true }).click();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("4");
  await page.getByRole("button", { name: "이전 기기 기록 복구", exact: true }).click();
  await confirmation.getByRole("button", { name: "기록 복구", exact: true }).click();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("7");
  expect(requests).toEqual(["PUT", "GET", "GET"]);
  await loadPackageModules(page);
  expect(await page.evaluate(async () => window.packageStore.listLessonPackages(window.deviceAccess.readDeviceAccess()!.accountId))).toEqual([]);
  expect(await page.evaluate(async () => (await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!)).record?.runs[0].nextPhrase)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Build Error|Runtime Error/)).toHaveCount(0);
  expect(errors).toEqual([]);
  // Only the transfer section: no profile, URL, cookie or personal record payload.
  await page.getByRole("region", { name: "학습 기록 전송" }).screenshot({ path: `/tmp/snapshot-transfer-${testInfo.project.name}.png` });
});

test("uncertain upload is not retried and account changes discard a held download", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  let uploads = 0;
  await page.route("**/api/learner/snapshot", async route => { uploads++; await route.abort("failed"); });
  await page.getByRole("button", { name: "계정에 업로드", exact: true }).click();
  await expect(page.getByText(/서버에 저장되었을 수 있습니다/)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: "계정에 업로드", exact: true })).toBeEnabled();
  expect(uploads).toBe(1);
  await page.unroute("**/api/learner/snapshot");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/learner/snapshot", async route => { await held; await route.fulfill({ json: { snapshot: null } }).catch(() => {}); });
  const requested = page.waitForRequest("**/api/learner/snapshot");
  await page.getByRole("button", { name: "계정에서 다운로드", exact: true }).click(); await requested;
  await loadPackageModules(page);
  await page.evaluate(() => {
    window.deviceAccess.clearDeviceAccess();
    localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify({ accountId: "other-account", epoch: "new-epoch" }));
    window.dispatchEvent(new Event("device-access-changed"));
  });
  release();
  await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeHidden();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("계정에 저장된 학습 기록이 없습니다.", { exact: true })).toHaveCount(0);
});

test("invalid cloud data and failed local commit preserve active and backup; disposed fetch is ignored", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  const snapshot = await page.evaluate(async () => {
    const access = window.deviceAccess.readDeviceAccess()!, store = window.deviceStore;
    await store.writeDeviceLearningSettings(access.accountId, 3, {}, (await store.readDeviceLearningState(access)).writer);
    const value = window.snapshotModel.exportAccountSnapshot((await store.readDeviceLearningState(access)).record!);
    await store.replaceDeviceSnapshot(access, { ...value, preferredLevel: 7 });
    return value;
  });
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const download = page.getByRole("button", { name: "계정에서 다운로드", exact: true });
  for (const value of [null, { ...snapshot, preferredLevel: 1 }, { ...snapshot, preferredLevel: 99 }, { ...snapshot, accountId: "foreign" }]) {
    await page.route("**/api/learner/snapshot", route => route.fulfill({ json: { snapshot: value } }));
    await download.click();
    await expect(download).toBeEnabled();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByLabel("학습 레벨")).toHaveValue("7");
    await page.unroute("**/api/learner/snapshot");
  }
  // Inject only transaction failure; validation and storage remain production code.
  await page.route("**/api/learner/snapshot", route => route.fulfill({ json: { snapshot } }));
  await download.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      IDBObjectStore.prototype.put = original;
      const request = original.apply(this, args); this.transaction.abort(); return request;
    };
  });
  await page.getByRole("button", { name: "기록 교체", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "교체하지 않았습니다" })).toBeVisible();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("7");
  await page.getByRole("button", { name: "이전 기기 기록 복구", exact: true }).click();
  await page.getByRole("button", { name: "기록 복구", exact: true }).click();
  await expect(page.getByLabel("학습 레벨")).toHaveValue("3");
  await page.unroute("**/api/learner/snapshot");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/learner/snapshot", async route => { await held; await route.fulfill({ json: { snapshot } }).catch(() => {}); });
  const requested = page.waitForRequest("**/api/learner/snapshot");
  await download.click(); await requested;
  await expect(download).toBeDisabled();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  release();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByLabel("학습 레벨")).toHaveValue("3");
});
