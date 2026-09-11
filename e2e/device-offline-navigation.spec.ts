import { expect, test } from "./fixtures/cloud-ui";
import type { BrowserContext } from "@playwright/test";
import { advanceCloudClock, openLearnerPage, readDeviceJournal } from "./fixtures/cloud-navigation";
import { confirmManualListen } from "./fixtures/manual-practice";
import { seedServerJournal } from "./fixtures/cloud-journal";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";
import { loadPackageModules } from "./fixtures/package-store";

async function setDeviceOffline(context: BrowserContext, offline: boolean) {
  for (const worker of context.serviceWorkers()) await worker.evaluate(value => {
    const scope = globalThis as typeof globalThis & { fixtureOnlineFetch?: typeof fetch };
    if (value) { scope.fixtureOnlineFetch ??= scope.fetch; scope.fetch = async () => { throw new TypeError("Fixture worker network offline"); }; }
    else if (scope.fixtureOnlineFetch) scope.fetch = scope.fixtureOnlineFetch;
  }, offline);
  await context.setOffline(offline);
}

test("canceling offline catalog exit retains the failed audio boundary for retry before switching lessons", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  for (const lesson of ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"]) {
    await openLearnerPage(page, `/player?lesson=${lesson}&level=1&stage=1`);
  }
  await page.goto("/offline");
  await loadPackageModules(page);
  await setDeviceOffline(context, true);
  await page.getByRole("region", { name: /^Morning Routine .* 스테이지$/ }).getByRole("link", { name: /스테이지 1 · Lv 1/ }).click();
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeVisible();
  const runId = new URL(page.url()).searchParams.get("run");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
  const before = (await readDeviceJournal(page))!.runs.find(run => run.runId === runId)!;
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "accounts") throw new DOMException("Fixture quota failure", "QuotaExceededError");
      return original.apply(this, args);
    };
    window.addEventListener("restore-storage", () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
  await expect(page.getByRole("button", { name: "기기 저장 재시도" })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("저장하지 못한 변경이 있습니다");
  await page.getByRole("alertdialog").getByRole("button", { name: "계속 학습", exact: true }).click();
  await expect(page.getByRole("button", { name: "기기 저장 재시도" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("run")).toBe(runId);
  expect((await readDeviceJournal(page))!.runs.find(run => run.runId === runId)).toEqual(before);
  await page.evaluate(() => window.dispatchEvent(new Event("restore-storage")));
  await page.getByRole("button", { name: "기기 저장 재시도" }).click();
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  expect((await readDeviceJournal(page))!.runs.find(run => run.runId === runId)).toMatchObject({ nextUnit: 1, nextPhrase: 1, confirmedCycles: 0, revision: before.revision + 1 });
  await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("region", { name: /^Daily Conversation .* 스테이지$/ }).getByRole("link", { name: /스테이지 1 · Lv 1/ }).click();
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("lesson")).toBe("10000000-0000-4000-8000-000000000002");
  await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
  await page.getByRole("region", { name: /^Morning Routine .* 스테이지$/ }).getByRole("link", { name: /스테이지 1 · Lv 1/ }).click();
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  expect(new URL(page.url()).searchParams.get("run")).toBe(runId);
});

for (const failure of ["rejected", "held"] as const) test(`offline catalog and menu guard a ${failure} rapid completion; explicit discard restores the last durable checkpoint`, async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-09-10T00:00:00Z") });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=6&stage=11");
  await loadPackageModules(page);
  const saved = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const journal = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    const run = journal.runs.find(value => value.stage === 11)!;
    return window.deviceStore.saveDeviceRun(access, { ...run, nextUnit: 2, nextPhrase: 2 }, run.revision);
  });
  await page.goto(`/offline?lesson=${saved.lessonId}&stage=11&run=${saved.runId}`);
  await expect(page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "2");
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  await setDeviceOffline(context, true);
  await page.evaluate(failure => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name !== "accounts") return original.apply(this, args);
      if (failure === "rejected") throw new DOMException("Fixture quota failure", "QuotaExceededError");
      // Keep the real strict-durability transaction in flight until the test
      // aborts it. This is an IndexedDB boundary fault, not player state access.
      const request = original.apply(this, args);
      const store = this;
      const keepAlive = () => { store.get("fixture-keepalive").onsuccess = keepAlive; };
      keepAlive();
      window.addEventListener("abort-held-storage", () => store.transaction.abort(), { once: true });
      return request;
    };
    window.addEventListener("restore-storage", () => { IDBObjectStore.prototype.put = original; }, { once: true });
  }, failure);
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await advanceCloudClock(page, 6000);
  if (failure === "rejected") await expect(page.getByRole("button", { name: "기기 저장 재시도" })).toBeVisible();
  else {
    await expect(page.getByRole("button", { name: /^PAUSE/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "기기 저장 재시도" })).toHaveCount(0);
  }
  if (failure === "rejected") await page.getByRole("alertdialog").getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("저장하지 못한 변경이 있습니다");
  await page.getByRole("alertdialog").getByRole("button", { name: "계속 학습", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("run")).toBe(saved.runId);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("저장하지 못한 변경이 있습니다");
  await page.getByRole("alertdialog").getByRole("button", { name: "계속 학습", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("run")).toBe(saved.runId);
  if (failure === "held") {
    await page.evaluate(() => window.dispatchEvent(new Event("abort-held-storage")));
    await expect(page.getByRole("button", { name: "기기 저장 재시도" })).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "닫기", exact: true }).click();
  }
  await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("저장하지 못한 변경이 있습니다");
  await page.getByRole("alertdialog").getByRole("button", { name: "나가기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "기기 학습", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("restore-storage")));
  const journal = (await readDeviceJournal(page))!;
  expect(journal.runs.find(run => run.runId === saved.runId)).toEqual(saved);
  expect(journal.history).toEqual([]);
  expect(journal.studyDays).toEqual([]);
  await page.getByRole("region", { name: /^Morning Routine .* 스테이지$/ }).getByRole("link", { name: /스테이지 11 · Lv 6/ }).click();
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "2");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료", exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("run")).toBe(saved.runId);
});

test("cold offline reload restores a non-level-one installed stage and checkpoint", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=4&stage=7");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
  await page.getByRole("button", { name: "NEXT · 다음 묶음", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "1");
  const run = new URL(page.url()).searchParams.get("run");
  await page.goto(`/offline?lesson=10000000-0000-4000-8000-000000000002&stage=7&run=${run}`);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);

  await setDeviceOffline(context, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="device-offline-shell"]')).toHaveAttribute("content", "1");
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 4", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "1");
  expect(new URL(page.url()).searchParams.get("stage")).toBe("7");
});

for (const startup of ["ready", "delayed", "revalidated"] as const) test(`offline catalog and browser history switch lessons while preserving distinct checkpoints (${startup} startup)`, async ({ page, context }) => {
  const step = <T>(phase: string, action: () => Promise<T>) => test.step(`offline-history:${phase}:${startup}`, action);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (["error", "warning"].includes(message.type()) && !message.text().includes("net::ERR_INTERNET_DISCONNECTED")) errors.push(message.text());
  });
  const first = page.getByRole("region", { name: /^Morning Routine .* 스테이지$/ });
  const second = page.getByRole("region", { name: /^Daily Conversation .* 스테이지$/ });
  await step("setup", async () => {
    await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    for (const lesson of ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"]) {
      await openLearnerPage(page, `/player?lesson=${lesson}&level=1&stage=1`);
    }
    await loadPackageModules(page);
    await page.evaluate(async () => {
      const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
      const firstPackage = (await window.packageStore.listLessonPackages(access.accountId)).find(row => row.lessonId.endsWith("1"))!;
      const secondPackage = (await window.packageStore.listLessonPackages(access.accountId)).find(row => row.lessonId.endsWith("2"))!;
      const firstLesson = (await window.packageStore.readLessonPackage(access.accountId, firstPackage.lessonId, firstPackage.version))!.manifest.lesson;
      const secondLesson = (await window.packageStore.readLessonPackage(access.accountId, secondPackage.lessonId, secondPackage.version))!.manifest.lesson;
      const first = await window.deviceStore.startDeviceRun(access, firstLesson, 3);
      const completed = await window.deviceStore.startDeviceRun(access, firstLesson, 4);
      const second = await window.deviceStore.startDeviceRun(access, secondLesson, 7);
      await window.deviceStore.saveDeviceRun(access, { ...first, nextUnit: 1, nextPhrase: 1 }, first.revision);
      await window.deviceStore.saveDeviceRun(access, { ...completed, nextUnit: 3, nextPhrase: 3, completedAt: "2026-09-10T01:00:00.000Z" }, completed.revision);
      await window.deviceStore.saveDeviceRun(access, { ...second, nextUnit: 1, nextPhrase: 2 }, second.revision);
    });
  });
  await step("catalog", async () => {
    await page.goto("/offline");
    await expect(first.getByRole("link")).toHaveCount(16);
    await expect(second.getByRole("link")).toHaveCount(16);
    await expect(page.getByRole("link", { name: "스테이지 16 · Lv 8", exact: true })).toHaveCount(2);
    await expect(first.getByRole("link", { name: /스테이지 3 · Lv 2.*이어서 · 프레이즈 2/ })).toBeVisible();
    await expect(first.getByRole("link", { name: /스테이지 4 · Lv 2.*완료 1회/ })).toBeVisible();
    await expect(second.getByRole("link", { name: /스테이지 7 · Lv 4.*이어서 · 묶음 2/ })).toBeVisible();
  });
  await step("first-player", async () => {
    await setDeviceOffline(context, true);
    await first.getByRole("link", { name: /스테이지 3 · Lv 2/ }).click();
    await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 2", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  });
  await step("return-catalog", async () => {
    await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
    await expect(page.getByRole("region", { name: /^Daily Conversation .* 스테이지$/ })).toBeVisible();
  });
  await step("second-startup", async () => {
    if (startup !== "ready") await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
        const request = original.apply(this, args);
        if (this.name === "accounts") {
          IDBObjectStore.prototype.put = original;
          // Delay the real startup transaction, not the player or History API.
          // A Back traversal must win even before React unmounts the old player.
          const store = this;
          let released = false;
          const keepAlive = () => { if (!released) store.get("fixture-keepalive").onsuccess = keepAlive; };
          keepAlive();
          Object.assign(window, { fixtureStartupHeld: true });
          window.addEventListener("release-held-startup", () => { released = true; IDBObjectStore.prototype.put = original; }, { once: true });
        }
        return request;
      };
    });
    await page.getByRole("region", { name: /^Daily Conversation .* 스테이지$/ }).getByRole("link", { name: /스테이지 7 · Lv 4/ }).click();
    if (startup !== "ready") await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { fixtureStartupHeld?: boolean }).fixtureStartupHeld))).toBe(true);
    if (startup === "revalidated") await page.evaluate(() => {
      // A same-package change notification temporarily fences playback, but it
      // must not abandon startup when the URL and installed bytes stay current.
      window.dispatchEvent(new CustomEvent("lesson-packages-changed", { detail: { lessonId: "10000000-0000-4000-8000-000000000002" } }));
      window.dispatchEvent(new Event("release-held-startup"));
    });
    if (startup !== "delayed") {
      await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 4", exact: true })).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "1");
      await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeEnabled();
    }
  });
  await step("back-catalog", async () => {
    await page.goBack();
    if (startup === "delayed") await page.evaluate(() => window.dispatchEvent(new Event("release-held-startup")));
    await expect(page).toHaveURL(/\/offline$/);
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await expect(page).toHaveURL(/\/offline$/);
  });
  await step("back-first", async () => {
    await page.goBack();
    await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 2", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
    expect(new URL(page.url()).searchParams.get("stage")).toBe("3");
  });
  await step("forward-catalog", async () => {
    await page.goForward();
    await expect(page).toHaveURL(/\/offline$/);
    await expect(first).toBeVisible();
  });
  await step("forward-second", async () => {
    await page.goForward();
    await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 4", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "1");
    expect(new URL(page.url()).searchParams.get("stage")).toBe("7");
    await expect(page).toHaveTitle(/Meta Shadowing/i);
    await expect(page.locator("nextjs-portal").getByText(/Runtime Error|Build Error/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  await step("screenshot", () => page.screenshot({ path: test.info().outputPath("offline-history-restored.png"), animations: "disabled" }));
});

for (const refreshPhase of ["inventory", "selection"] as const) test(`a late ${refreshPhase} refresh keeps the offline catalog and its latest checkpoint`, async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=2&stage=3");
  await page.goto("/offline");
  await page.getByRole("link", { name: /스테이지 3 · Lv 2/ }).click();
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 2", exact: true })).toBeVisible();
  const run = new URL(page.url()).searchParams.get("run");
  await setDeviceOffline(context, true);
  await loadPackageModules(page);
  await page.evaluate(async refreshPhase => {
    const { record, writer } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const run = record!.runs.find(value => value.runId === new URL(location.href).searchParams.get("run"))!;
    const original = IDBObjectStore.prototype.get;
    let grants = 0;
    IDBObjectStore.prototype.get = function(...args: Parameters<IDBObjectStore["get"]>) {
      const request = original.apply(this, args);
      // With one package, inventory reads its initial/final grant and then
      // its display grant (#3). Selected-package validation ends at grant #5.
      // Hold the real final transaction completion, not its data or checks.
      if (this.name === "grants" && ++grants === (refreshPhase === "inventory" ? 3 : 5)) {
        IDBObjectStore.prototype.get = original;
        const transaction = this.transaction;
        const complete = transaction.oncomplete!;
        transaction.oncomplete = event => {
          window.addEventListener("release-held-refresh", () => {
            complete.call(transaction, event);
            // Drain the released refresh's promise continuations and render,
            // not an unrelated package read that could race the old result.
            requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(window, { fixtureRefreshSettled: true })));
          }, { once: true });
          Object.assign(window, { fixtureRefreshHeld: true });
        };
      }
      return request;
    };
    await window.deviceStore.saveDeviceRun(writer, { ...run, nextUnit: 1, nextPhrase: 1 }, run.revision);
  }, refreshPhase);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { fixtureRefreshHeld?: boolean }).fixtureRefreshHeld))).toBe(true);
  await page.getByRole("button", { name: "다른 다운로드 레슨", exact: true }).click();
  const catalog = page.getByRole("heading", { name: "기기 학습", exact: true });
  await expect(catalog).toBeVisible();
  await expect(page).toHaveURL(/\/offline$/);
  await page.evaluate(() => window.dispatchEvent(new Event("release-held-refresh")));
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { fixtureRefreshSettled?: boolean }).fixtureRefreshSettled))).toBe(true);
  await expect(catalog).toBeVisible();
  await expect(page).toHaveURL(/\/offline$/);
  await expect(page.getByRole("link", { name: /스테이지 3 · Lv 2.*이어서 · 프레이즈 2/ })).toBeVisible();
  await page.getByRole("link", { name: /스테이지 3 · Lv 2/ }).click();
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 2", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  expect(new URL(page.url()).searchParams.get("run")).toBe(run);
});

test("requested run selects its exact retained version and cold reload keeps that pin", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const lessonId = "10000000-0000-4000-8000-000000000002";
  await openLearnerPage(page, `/player?lesson=${lessonId}&level=4&stage=7`);
  await loadPackageModules(page);
  const seeded = await page.evaluate(async lessonId => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const inventory = (await window.packageStore.listLessonPackages(access.accountId)).find(row => row.lessonId === lessonId)!;
    const current = (await window.packageStore.readLessonPackage(access.accountId, lessonId, inventory.version))!;
    const oldVersion = "2026-08-10T00:00:00.000Z";
    const manifest = { ...current.manifest, lesson: { ...current.manifest.lesson, version: oldVersion } };
    let ticket = await window.packageStore.reservePackageInstall(access.accountId, lessonId);
    ticket = await window.packageStore.beginPackageInstall(ticket, { accountId: access.accountId, manifest, sha256: await window.packageModel.manifestDigest(manifest) });
    for (const [index, blob] of current.audio.entries()) await window.packageStore.stagePackageAudio(ticket, index, blob);
    await window.packageStore.commitPackageInstall(ticket);
    const run = await window.deviceStore.startDeviceRun(access, manifest.lesson, 7);
    const saved = await window.deviceStore.saveDeviceRun(access, { ...run, nextUnit: 2, nextPhrase: 4 }, run.revision);
    return { currentVersion: inventory.version, oldVersion, runId: saved.runId };
  }, lessonId);
  expect(new URL(page.url()).searchParams.get("version")).toBe(seeded.currentVersion);
  await page.goto("/offline");
  const old = page.getByRole("region", { name: `Daily Conversation ${seeded.oldVersion} 스테이지`, exact: true });
  await expect(old.getByText(`게시 버전 ${seeded.oldVersion}`, { exact: true })).toBeVisible();
  await expect(old.getByRole("link", { name: /스테이지 7 · Lv 4.*이어서 · 묶음 3/ })).toBeVisible();
  await page.goto(`/offline?lesson=${lessonId}&stage=7&run=${seeded.runId}`);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  await setDeviceOffline(context, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 4", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "2");
  expect(new URL(page.url()).searchParams.get("version")).toBe(seeded.oldVersion);
  expect(new URL(page.url()).searchParams.get("run")).toBe(seeded.runId);
});

test("legacy cloud progress and completion cannot override the local journal", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await seedServerJournal(page, { progress: null, studyDays: ["2026-09-09"], history: [{
    runId: "cloud-only-completion", lessonId: "10000000-0000-4000-8000-000000000002", lessonVersion: "fixture-v1",
    lessonName: "Daily Conversation", language: "english", level: 8, stage: 16, nextUnit: 10, nextPhrase: 10,
    activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS, completedAt: "2026-09-09T01:00:00.000Z",
  }] });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=4&stage=7");
  await page.goto("/lessons/10000000-0000-4000-8000-000000000002/stages");
  await expect(page.getByRole("button", { name: "현재 스테이지 7 시작", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "완료한 스테이지" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByLabel("0일 연속 학습", { exact: true })).toBeVisible();
});

test("stage preview starts every level with device settings", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=1&stage=1");
  await loadPackageModules(page);
  await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    await window.deviceStore.writeDeviceLearningSettings(access.accountId, 4, { speed: 2, groupSize: 3 }, access);
  });
  await page.goto("/lessons/10000000-0000-4000-8000-000000000002/stages");
  await page.getByRole("radio", { name: /^7 다문장 암기/ }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 4", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.getByText("수동 · 2×")).toBeVisible();
  await loadPackageModules(page);
  const record = await page.evaluate(() => window.deviceStore.readDeviceLearningRecord(window.deviceAccess.readDeviceAccess()!.accountId));
  expect(record?.runs.find(run => run.stage === 7)?.settings).toMatchObject({ speed: 2, groupSize: 3 });
});
