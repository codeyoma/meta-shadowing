import { expect, test } from "./fixtures/cloud-ui";
import { openLearnerPage, readDeviceJournal } from "./fixtures/cloud-navigation";
import { confirmManualListen } from "./fixtures/manual-practice";
import { writeFile } from "node:fs/promises";

for (let level = 1; level <= 8; level++) test(`level ${level} saves through delayed and failed sync, then reconnects without notices`, async ({ page, context }) => {
  test.setTimeout(60000);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  let release!: () => void, attempted = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/learner/snapshot", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    const payload = route.request().postDataJSON();
    expect(payload.options).toBeUndefined();
    expect(payload.runs.length).toBeGreaterThan(0);
    if (!attempted) { attempted = true; await held; await route.abort("failed").catch(() => {}); }
    else await route.continue();
  });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000002&level=${level}&stage=${level * 2 - 1}`);
  const accountId = (await readDeviceJournal(page))!.accountId;
  expect((await page.request.put("/api/learner/snapshot", { data: { protocolVersion: 1, accountId, runs: [], history: [], studyDays: ["2026-09-01"] } })).status()).toBe(200);
  await page.clock.install();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.clock.runFor(100);
  await expect.poll(() => attempted).toBe(true);
  await context.setOffline(true);
  if (level <= 5) {
    await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
    for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
    await page.getByRole("button", { name: level >= 4 ? "NEXT · 다음 묶음" : "NEXT · 다음 프레이즈", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
    for (let index = 0; index < 24; index++) { await page.clock.runFor(250); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))); }
  }
  const before = (await readDeviceJournal(page))!;
  const run = before.runs.find(value => value.level === level)!;
  expect(run.nextUnit).toBe(1);
  expect(run.nextPhrase).toBe(level >= 4 && level <= 5 ? 2 : 1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /저장|동기화|오프라인|온라인/ })).toHaveCount(0);
  release();
  await context.setOffline(false);
  for (let attempt = 0; attempt < 4; attempt++) { await page.clock.runFor(3000); await page.waitForTimeout(50); }
  await expect.poll(async () => {
    const response = await page.request.get("/api/learner/snapshot");
    const result = await response.json();
    return result.snapshot?.runs.find((value: { runId: string }) => value.runId === run.runId)?.nextUnit;
  }).toBe(1);
  const cloud = await (await page.request.get("/api/learner/snapshot")).json();
  expect(cloud.snapshot.studyDays).toContain("2026-09-01");
  expect(cloud.optionsRevision).toBe(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.reload();
  expect((await readDeviceJournal(page))!.runs.find(value => value.runId === run.runId)).toEqual(run);
});

test("local failure dialog is centered, traps keyboard focus, and dismissal keeps progression blocked", async ({ page }, info) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { if (this.name === "accounts") throw new DOMException("Fixture quota failure", "QuotaExceededError"); return original.apply(this, args); };
    window.addEventListener("restore-storage", () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  const next = page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true });
  await next.click();
  const dialog = page.getByRole("alertdialog", { name: "기기에 학습을 저장하지 못했습니다." });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!, viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  for (let index = 0; index < 5; index++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await dialog.screenshot({ path: `/tmp/quiet-save-dialog-${info.project.name}.png`, animations: "disabled" });
  await page.screenshot({ path: `/tmp/quiet-save-viewport-${info.project.name}.png`, animations: "disabled" });
  const overlay = page.locator('[data-slot="dialog-overlay"]').last();
  const blur = await overlay.evaluate(element => getComputedStyle(element).backdropFilter);
  expect(blur).toMatch(/blur\(/);
  const contrast = await dialog.evaluate(element => {
    const channels = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => rgb.map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    return [...element.querySelectorAll('h2, p, button')].map(node => {
      let parent: Element | null = node, background = "";
      while (parent) { background = getComputedStyle(parent).backgroundColor; if (!background.endsWith(", 0)" ) && background !== "transparent") break; parent = parent.parentElement; }
      const color = getComputedStyle(node).color, light = [luminance(channels(color)), luminance(channels(background))].sort((a, b) => b - a);
      return { tag: node.tagName, color, background, ratio: (light[0] + .05) / (light[1] + .05) };
    });
  });
  for (const sample of contrast) expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
  await writeFile(`/tmp/quiet-dialog-evidence-${info.project.name}.json`, JSON.stringify({ box, viewport, blur, contrast }, null, 2));
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(next).toBeDisabled();
  await expect(page.getByRole("button", { name: "기기 저장 재시도", exact: true })).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new Event("restore-storage")));
  await page.getByRole("button", { name: "기기 저장 재시도", exact: true }).click();
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("offline-shell failure is quiet until explicit download and does not claim offline readiness", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.serviceWorker.register = async () => { throw new DOMException("Fixture denied", "SecurityError"); };
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect(page.getByRole("heading", { name: "언어 선택", exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Morning Routine 다운로드", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "오프라인 화면을 준비하지 못했습니다." });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("준비 전에는 오프라인에서 새로 열 수 없습니다");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Morning Routine 다운로드", exact: true })).toContainText("다운로드 완료");
});

for (const mode of ["conflict", "lost-response"] as const) test(`explicit options ${mode} uses real HTTP CAS and preserves device authority`, async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  const accountId = (await readDeviceJournal(page))!.accountId;
  let intercepted = false, puts = 0;
  await page.route("**/api/learner/snapshot", async route => {
    if (route.request().method() === "PUT") {
      puts++;
      if (mode === "lost-response") { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("failed"); return; }
    }
    if (mode === "conflict" && !intercepted && route.request().method() === "GET") {
      intercepted = true;
      const response = await route.fetch();
      const previous = await response.json();
      expect((await page.request.put("/api/learner/snapshot", { data: { protocolVersion: 1, accountId, runs: [], history: [], studyDays: ["2026-09-01"],
        options: { expectedRevision: previous.optionsRevision, preferredLevel: 7, settings: {} } } })).status()).toBe(200);
      await route.fulfill({ response }); return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "지금 동기화", exact: true }).click();
  if (mode === "conflict") {
    await expect(page.getByRole("alertdialog")).toContainText("다른 기기");
    const saved = await (await page.request.get("/api/learner/snapshot")).json();
    expect(saved.snapshot.preferredLevel).toBe(7); expect(saved.snapshot.studyDays).toEqual(["2026-09-01"]);
    await page.getByRole("alertdialog").getByRole("button", { name: "닫기", exact: true }).click();
  } else {
    await expect(page.getByRole("button", { name: "지금 동기화", exact: true })).toBeEnabled();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const saved = await (await page.request.get("/api/learner/snapshot")).json();
    expect(saved.snapshot.preferredLevel).toBe(4); expect(saved.optionsRevision).toBe(1);
  }
  expect(puts).toBe(1);
  await expect(page.getByLabel("학습 레벨")).toHaveValue("4");
});

test("manual HTTP authentication rejection ends local access and preserves local settings", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("학습 레벨").selectOption("4");
  await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  const accountId = (await readDeviceJournal(page))!.accountId;
  await page.context().clearCookies();
  await page.getByRole("button", { name: "계정에서 다운로드", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다." })).toBeVisible();
  expect(await page.evaluate(() => window.deviceAccess.readDeviceAccess())).toBeNull();
  expect(await page.evaluate(async id => (await window.deviceStore.readDeviceLearningRecord(id))?.preferredLevel, accountId)).toBe(4);
});

test("terminal background problems deduplicate reconnects while explicit retry can show failure again", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  let attempts = 0;
  let release!: () => void;
  const entryReady = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/learner/snapshot", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    expect(route.request().postDataJSON().runs.length).toBeGreaterThan(0);
    attempts++;
    if (attempts === 1) await entryReady;
    await route.fulfill({ status: 413, json: { error: "merge-limit" } });
  });
  try {
    await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
    release();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const dialog = page.getByRole("alertdialog", { name: "학습 기록 동기화를 확인해 주세요." });
    await expect(dialog).toBeVisible();
    expect(attempts).toBe(1);
    await dialog.getByRole("button", { name: "동기화 재시도", exact: true }).click();
    await expect.poll(() => attempts).toBe(2);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await page.evaluate(() => { window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus")); });
    await expect(dialog).toHaveCount(0);
    expect(attempts).toBe(2);
    await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeEnabled();
  } finally { release(); }
});

for (const action of ["pause", "delete", "failure"] as const) test(`download ${action} preserves deliberate cancellation versus actionable failure`, async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15000 }).toBe(true);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const path = "**/api/lessons/10000000-0000-4000-8000-000000000001/audio/2?*";
  await page.route(path, async route => { if (action === "failure") await route.abort(); else { await held; await route.continue().catch(() => {}); } });
  try {
    const row = page.getByRole("group", { name: "Morning Routine 다운로드", exact: true });
    await row.getByRole("button", { name: "Morning Routine 다운로드", exact: true }).click();
    if (action === "failure") {
      const dialog = page.getByRole("alertdialog", { name: "레슨을 다운로드하지 못했습니다." });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    } else {
      await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
      await row.getByRole("button", { name: `Morning Routine 다운로드 ${action === "pause" ? "일시 정지" : "삭제"}`, exact: true }).click();
      await expect(row).toContainText(action === "pause" ? "다운로드 일시 정지" : "다운로드 필요");
    }
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    release(); await page.unroute(path);
    await row.getByRole("button", { name: action === "pause" ? "Morning Routine 이어받기" : action === "delete" ? "Morning Routine 다운로드" : /^Morning Routine (이어받기|다시 받기)$/, exact: true }).click();
    await expect(row).toContainText("다운로드 완료");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  } finally { release(); }
});
