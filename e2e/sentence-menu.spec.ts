import { enterAccountPractice, pauseCloudClock, advanceCloudClock, readServerJournal, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

async function open(page: Page, level: number, lesson = "10000000-0000-4000-8000-000000000002", group = 2) {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await openLearnerPage(page, `/player?lesson=${lesson}&level=${level}&group=${group}&groupGap=0`);
  await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
}

async function selectSentence(page: Page, number: number) {
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "문장 목록", exact: true });
  for (const section of await menu.locator('button[aria-expanded="false"]').all()) await section.click();
  await menu.getByRole("button", { name: new RegExp(`^${number}번 문장`) }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("selected sentences center after expansion without scrolling the sheet header", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await open(page, 1);
  for (const number of [1, 5, 10]) {
    await selectSentence(page, number);
    await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "문장 목록", exact: true }).click();
    const sheet = page.locator("#player-menu");
    await sheet.click({ trial: true });
    const selected = sheet.getByRole("button", { name: new RegExp(`^${number}번 문장`) });
    await expect(selected).toBeFocused();
    const selectedBox = (await selected.boundingBox())!;
    const listBox = (await sheet.locator('[data-slot="sentence-list"]').boundingBox())!;
    expect(selectedBox.y).toBeGreaterThanOrEqual(listBox.y - 1);
    expect(selectedBox.y + selectedBox.height).toBeLessThanOrEqual(listBox.y + listBox.height + 1);
    if (number === 5) expect(selectedBox.y + selectedBox.height / 2).toBeCloseTo(listBox.y + listBox.height / 2, 0);
    for (const view of ["sentences", "menu"]) {
      if (view === "menu") {
        await sheet.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).click();
        await sheet.click({ trial: true });
      }
      const bounds = (await sheet.boundingBox())!;
      const header = (await sheet.locator('[data-slot="drawer-header"]').boundingBox())!;
      expect.soft(header.y, `${number}: ${view} header stays inside sheet`).toBeGreaterThanOrEqual(bounds.y);
      expect.soft(bounds.y + bounds.height, `${number}: ${view} sheet stays bottom-anchored`).toBeCloseTo(page.viewportSize()!.height, 0);
      expect.soft(await sheet.evaluate(element => element.scrollTop), `${number}: only the list scrolls`).toBe(0);
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  }
});

test("menu title is centered between equal noninteractive slots", async ({ page }) => {
  await open(page, 1);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  const sheet = page.locator("#player-menu");
  await sheet.click({ trial: true });
  const title = sheet.getByRole("heading", { name: "학습 메뉴", exact: true });
  const heading = title.locator("..");
  const titleBox = (await title.boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  expect(titleBox.x + titleBox.width / 2).toBeCloseTo(headingBox.x + headingBox.width / 2, 0);
  await expect(title).toHaveCSS("text-align", "center");
  await expect(heading.getByRole("button")).toHaveCount(0);
});

test("the sentence drawer has a white surface and menu back action without a Close button", async ({ page }) => {
  await open(page, 1);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "문장 목록", exact: true });
  const title = menu.getByRole("heading", { name: "문장 목록", exact: true });
  const header = menu.locator('[data-slot="drawer-header"]');
  await expect(menu).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const back = header.getByRole("button", { name: "메뉴로 돌아가기", exact: true });
  await expect(back).toBeVisible();
  await expect(header.getByRole("button", { name: "문장 목록 닫기", exact: true })).toHaveCount(0);
  await expect(menu.locator("#sentence-menu-help")).toHaveCount(0);
  await expect(menu).toHaveAttribute("aria-describedby", "player-menu-description");
  await page.screenshot({ path: test.info().outputPath("sentence-menu-without-helper.png"), animations: "disabled", scale: "css" });
  await expect(title).toHaveCSS("color", "rgb(4, 44, 96)");
  await expect(menu.getByRole("button", { name: /닫기/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/\/player\?/);
  await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeFocused();
});

for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) test(`level ${level} selects any sentence and restores the selected position after refresh`, async ({ page }) => {
  await open(page, level);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "문장 목록", exact: true });
  await expect(menu.getByRole("button", { name: /At home/ })).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("button", { name: /At work/ })).toHaveAttribute("aria-expanded", "false");
  await menu.getByRole("button", { name: /At work/ }).click();
  await expect(menu.getByRole("button", { name: /번 문장/ })).toHaveCount(10);
  await expect(menu.getByRole("button", { name: /^1번 문장/ })).toHaveAttribute("aria-current", "true");
  await expect(menu.getByRole("button", { name: /^1번 문장/ })).toHaveAccessibleName(/나는 창문을 연다\./);
  await menu.getByRole("button", { name: /^5번 문장/ }).click();
  await expect(menu).toHaveCount(0);
  const grouped = level === 4 || level === 5;
  const progress = page.getByRole("progressbar", { name: grouped ? "묶음 진행" : level < 6 ? "프레이즈 진행" : "문장 진행", exact: true });
  await expect(progress).toHaveAttribute("aria-valuenow", grouped ? "1" : "4");
  if (level < 6) await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeFocused();
  await reloadLearnerPage(page);
  await expect(progress).toHaveAttribute("aria-valuenow", grouped ? "1" : "4");
  await selectSentence(page, 1);
  await reloadLearnerPage(page);
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  const journal = await readServerJournal(page);
  expect(journal.history).toHaveLength(0);
  expect(journal.progress.nextPhrase).toBe(0);
});

test("a stale tab cannot write after takeover and can explicitly start again after the other tab completes", async ({ page, context }) => {
  await open(page, 1, "10000000-0000-4000-8000-000000000001");
  const oldRun = new URL(page.url()).searchParams.get("run");
  const otherTab = await context.newPage();
  await otherTab.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await otherTab.goto(page.url());
  await enterAccountPractice(otherTab);
  await selectSentence(otherTab, 3);
  await otherTab.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(otherTab);
    await expect(otherTab.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await otherTab.getByRole("button", { name: /^NEXT/ }).click();
  await expect(otherTab.getByRole("heading", { name: "레벨 1 학습 완료", exact: true })).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toContainText("다른 기기");
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeDisabled();
  await reloadLearnerPage(page);
  await expect(page.getByRole("heading", { name: "레벨 1 학습 완료", exact: true })).toBeVisible();
  // A new explicit entry, not a stale device's checkpoint, may create a new run.
  await otherTab.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  await expect(otherTab).toHaveURL(/\/lessons\?/);
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  await selectSentence(page, 2);
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행", exact: true })).toHaveAttribute("aria-valuenow", "1");
  await expect.poll(() => new URL(page.url()).searchParams.get("run")).not.toBe(oldRun);
  await reloadLearnerPage(page);
  await expect(page.getByRole("region", { name: "학습 자막" })).toContainText("I wash my face.");
  const journal = await readServerJournal(page);
  expect(journal.history).toHaveLength(1);
  expect(journal.history[0].runId).toBe(oldRun);
  expect(journal.progress.nextPhrase).toBe(1);
  await otherTab.close();
});

test("the menu pauses word timing, traps focus, ignores player shortcuts, and closes without auto-resuming", async ({ page }) => {
  await page.clock.install();
  await open(page, 6, "10000000-0000-4000-8000-000000000001");
  await pauseCloudClock(page, new Date(Date.now() + 1000));
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await advanceCloudClock(page, 150);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "문장 목록", exact: true });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("r");
  await advanceCloudClock(page, 10000);
  await page.keyboard.press("Tab");
  expect(await menu.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await expect(canvas).toHaveText("I");
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await advanceCloudClock(page, 150);
  await expect(canvas).toHaveText("wake");
});

test("jumping from an unfinished listen resets its cycles, hides hints, and preserves subtitle access", async ({ page }) => {
  await open(page, 3, "10000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await page.getByRole("button", { name: "자막 보기", exact: true }).click();
  await selectSentence(page, 2);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  const canvas = page.getByRole("region", { name: "학습 자막" });
  await expect(canvas).not.toContainText("wash");
  await page.getByRole("button", { name: "자막 보기", exact: true }).click();
  await expect(canvas).toContainText("I wash my face.");
});

test("completion acknowledged in the background allows an explicit restart after returning", async ({ page }) => {
  await open(page, 1, "10000000-0000-4000-8000-000000000001");
  await selectSentence(page, 3);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.route("**/api/learner/practice", async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().kind !== "advance") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: /^NEXT/ }).click();
  await expect(page.getByRole("heading", { name: "레벨 1 학습 완료", exact: true })).toBeVisible();
  await page.unroute("**/api/learner/practice");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const oldRun = new URL(page.url()).searchParams.get("run");
  await selectSentence(page, 2);
  await expect.poll(() => new URL(page.url()).searchParams.get("run")).not.toBe(oldRun);
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행", exact: true })).toHaveAttribute("aria-valuenow", "1");
  expect((await readServerJournal(page)).history).toHaveLength(1);
});

test("a completed screen stops renewing and permits another device after lease expiry", async ({ page, browser, baseURL }) => {
  test.setTimeout(60000);
  await page.clock.install();
  await open(page, 8, "10000000-0000-4000-8000-000000000001");
  await pauseCloudClock(page, new Date(Date.now() + 1000));
  await selectSentence(page, 3);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await advanceCloudClock(page, 10000);
  await expect(page.getByRole("heading", { name: "레벨 8 학습 완료", exact: true })).toBeVisible();
  let renewals = 0;
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/api/learner/practice") && request.postDataJSON().action === "renew") renewals++;
  });
  await advanceCloudClock(page, 20000);
  expect(renewals).toBe(0);
  const other = await browser.newContext({ baseURL, storageState: { cookies: await page.context().cookies(), origins: [] } });
  try {
    const next = await other.newPage();
    await next.goto("/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
    // The real server lease expires; no database timestamp changes or takeover.
    await expect.poll(async () => {
      if (await next.locator("#player-title").isVisible()) return true;
      await next.reload();
      return next.locator("#player-title").isVisible();
    }, { timeout: 40000, intervals: [1000] }).toBe(true);
    expect((await readServerJournal(next)).history).toHaveLength(1);
    await expect(page.getByRole("heading", { name: "레벨 8 학습 완료", exact: true })).toBeVisible();
  } finally { await other.close(); }
});

for (const [oldSize, newSize, sentence, nextUnit, nextPhrase, count] of [[2, 4, 5, 0, 0, 5], [4, 2, 4, 1, 2, 3]]) test(`a completed grouped run restarts with grouping ${oldSize} to ${newSize} at the selected sentence`, async ({ page }) => {
  test.setTimeout(60000);
  await open(page, 4, undefined, oldSize);
  await selectSentence(page, 10);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: /^NEXT/ }).click();
  await expect(page.getByRole("heading", { name: "레벨 4 학습 완료", exact: true })).toBeVisible();
  const oldRun = new URL(page.url()).searchParams.get("run");
  const { profile } = await (await page.request.get("/api/learner/preferences")).json();
  expect((await page.request.patch("/api/learner/preferences", { data: {
    accountId: profile.accountId, revision: profile.revision, changes: { groupSize: newSize, speed: 2 },
  } })).status()).toBe(200);
  await selectSentence(page, sentence);
  await expect.poll(() => new URL(page.url()).searchParams.get("run")).not.toBe(oldRun);
  // The five-sentence first section groups as [5] at size 4, [2,3] at size 2.
  await expect(page.getByRole("progressbar", { name: "묶음 진행", exact: true })).toHaveAttribute("aria-valuenow", String(nextUnit));
  await expect(page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem")).toHaveCount(count);
  const journal = await readServerJournal(page);
  expect(journal.progress).toMatchObject({ nextUnit, nextPhrase, activeMs: 0, settings: { groupSize: newSize, speed: 2 } });
  expect(journal.history).toHaveLength(1);
  expect(journal.history[0]).toMatchObject({ runId: oldRun, settings: { groupSize: oldSize, speed: 1 } });
});

for (const level of [1, 8]) for (const lostReceipt of [null, "start", "checkpoint"] as const) test(`level ${level} sentence selection after completion starts a fresh run without changing completion history${lostReceipt ? ` after a lost ${lostReceipt} receipt` : ""}`, async ({ page }) => {
  if (level === 8) await page.clock.install();
  await open(page, level, "10000000-0000-4000-8000-000000000001");
  if (level === 8) await pauseCloudClock(page, new Date(Date.now() + 1000));
  await selectSentence(page, 3);
  if (level === 1) {
    await page.getByRole("button", { name: /^CONTINUE/ }).click();
    for (let cycle = 1; cycle <= 3; cycle++) {
      await confirmManualListen(page);
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    }
    await page.getByRole("button", { name: /^NEXT/ }).click();
  } else {
    await page.getByRole("button", { name: /^CONTINUE/ }).click();
    await advanceCloudClock(page, 10000);
  }
  await expect(page.getByRole("heading", { name: `레벨 ${level} 학습 완료`, exact: true })).toBeVisible();
  const oldRun = new URL(page.url()).searchParams.get("run");
  const retriedCommands: unknown[] = [];
  let loseReceipt = Boolean(lostReceipt);
  if (lostReceipt) await page.route("**/api/learner/practice", async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().action !== lostReceipt) return route.continue();
    retriedCommands.push(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (loseReceipt) await route.fulfill({ status: 503, json: { error: "temporary-error" } });
    else await route.fulfill({ response });
  });
  await selectSentence(page, 2);
  if (lostReceipt) {
    await expect(page.getByRole("alert", { name: "학습 저장 알림" })).toContainText("저장을 확인하지 못했습니다");
    expect(new URL(page.url()).searchParams.get("run")).toBe(oldRun);
    await expect(page.getByRole("heading", { name: `레벨 ${level} 학습 완료`, exact: true })).toBeVisible();
    loseReceipt = false;
    await page.getByRole("button", { name: "저장 재시도", exact: true }).click();
  }
  await expect.poll(() => new URL(page.url()).searchParams.get("run")).not.toBe(oldRun);
  if (lostReceipt) {
    expect(retriedCommands).toHaveLength(2);
    expect(retriedCommands[1]).toEqual(retriedCommands[0]);
    await page.unroute("**/api/learner/practice");
  }
  if (level === 1) await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await reloadLearnerPage(page);
  if (level === 1) await expect(page.getByRole("region", { name: "학습 자막" })).toContainText("I wash my face.");
  else await expect(page.getByRole("progressbar", { name: "문장 진행", exact: true })).toHaveAttribute("aria-valuenow", "1");
  const journal = await readServerJournal(page);
  expect(journal.history).toHaveLength(1);
  expect(journal.history[0].runId).toBe(oldRun);
  expect(journal.progress.nextPhrase).toBe(1);
  expect(journal.progress.activeMs).toBe(0);
});
