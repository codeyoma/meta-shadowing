import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, signInFixtureAdmin, type Locator, type Page } from "./fixtures/cloud-ui";

async function expectFixedDocument(page: Page) {
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth <= innerWidth,
    height: document.documentElement.scrollHeight <= innerHeight,
    top: window.scrollY
  }))).toEqual({ width: true, height: true, top: 0 });
}

async function expectFullyInViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  // IntersectionObserver includes clipping by both nested scrollports. Allow one
  // CSS pixel for fractional scroll positions, not a percentage of a large box.
  await expect.poll(() => locator.evaluate(element => new Promise<number>(resolve => {
    const observer = new IntersectionObserver(([entry]) => {
      observer.disconnect();
      resolve(Math.max(
        entry.boundingClientRect.width - entry.intersectionRect.width,
        entry.boundingClientRect.height - entry.intersectionRect.height
      ));
    });
    observer.observe(element);
  }))).toBeLessThanOrEqual(1);
}

async function revealControl(locator: Locator) {
  // Center the target in each scrollable ancestor, including the outer shell on
  // short screens; the nearest-edge scroll can leave fractional clipping.
  await locator.evaluate(element => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  await expectFullyInViewport(locator);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 568, height: 320 }, { width: 667, height: 375 }, { width: 932, height: 430 }, { width: 1280, height: 900 }]) {
  test(`all stages and summary controls remain reachable with fixed navigation at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000001\/stages$/);
    await expect(page).toHaveTitle(/Meta Shadowing/);
    const heading = page.getByRole("heading", { level: 1 });
    const currentStart = page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true });
    await expect(currentStart).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await expectFullyInViewport(heading);
    const topNavigation = page.getByRole("navigation", { name: "상단 탐색", exact: true });
    const bottomNavigation = page.getByRole("navigation", { name: "하단 탐색", exact: true });
    const topBefore = await topNavigation.boundingBox();
    const bottomBefore = await bottomNavigation.boundingBox();
    async function expectFixedNavigation() {
      await expectFullyInViewport(topNavigation);
      await expectFullyInViewport(bottomNavigation);
      expect(await topNavigation.boundingBox()).toEqual(topBefore);
      expect(await bottomNavigation.boundingBox()).toEqual(bottomBefore);
      await expectFixedDocument(page);
    }
    await expectFixedNavigation();
    const main = (await page.getByRole("main").boundingBox())!;
    expect(main.width).toBeCloseTo(Math.min(430, viewport.width), 0);
    expect(main.x + main.width / 2).toBeCloseTo(viewport.width / 2, 0);
    const shell = page.getByRole("region", { name: "학습 단계", exact: true }).locator("..");
    const outerOverflows = await shell.evaluate(element => element.scrollHeight > element.clientHeight);
    const viewportElement = page.getByRole("region", { name: "학습 단계 목록", exact: true });
    const stages = viewportElement.getByRole("radio");
    await expect(stages).toHaveCount(16);
    for (let index = 0; index < 16; index++) {
      const stage = stages.nth(index);
      await expect(stage).toHaveAccessibleName(new RegExp(`^${index + 1} `));
      await revealControl(stage);
      await stage.click({ trial: true });
      await expectFixedNavigation();
    }
    expect(await viewportElement.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    if (outerOverflows) expect(await shell.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const last = stages.last();
    await last.click();
    const popup = page.getByRole("dialog", { name: "속사포 한글", exact: true });
    await expect(popup).toBeVisible();
    await expectFullyInViewport(popup.getByRole("heading", { name: "속사포 한글", exact: true }));
    await expectFullyInViewport(popup.getByRole("button", { name: "학습 시작", exact: true }));
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(19);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 19);
    expect(box.y).toBeGreaterThanOrEqual(19);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 19);
    await page.keyboard.press("Escape");
    await expect(last).toBeFocused();
    await expectFixedNavigation();
    // A middle node must leave a usable reading area, even in short landscape.
    const middle = page.getByRole("radio", { name: /^3 순간 암기/ });
    await revealControl(middle);
    await middle.click();
    const preview = page.getByRole("dialog", { name: "순간 암기", exact: true });
    await expectFullyInViewport(preview.getByRole("heading", { name: "순간 암기", exact: true }));
    const readingArea = preview.getByRole("region", { name: "스테이지 안내", exact: true });
    expect(await readingArea.evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(64);
    const description = preview.locator("#stage-3-description");
    await description.scrollIntoViewIfNeeded();
    await expectFullyInViewport(description);
    await expectFullyInViewport(preview.getByRole("button", { name: "학습 시작", exact: true }));
    await page.keyboard.press("Escape");
    await expect(middle).toBeFocused();

    // At the top of the inner path, an upward wheel must reach the summary in
    // the outer shell. Its title and actions need not fit there simultaneously.
    await viewportElement.evaluate(element => { element.scrollTop = 0; });
    await viewportElement.hover();
    await page.mouse.wheel(0, -1500);
    await expect.poll(() => shell.evaluate(element => element.scrollTop)).toBe(0);
    await expectFullyInViewport(heading);
    const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
    for (const control of [history, currentStart]) {
      await revealControl(control);
      await expect(control).toBeEnabled();
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await expectFixedNavigation();
  });
}

test("home and administrator screens scroll their content without moving their navigation", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await signInFixtureAdmin(page);
  for (const route of ["/home", "/admin", "/admin/lessons", "/admin/settings"]) {
    await openLearnerPage(page, route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectFixedDocument(page);
    const header = page.locator("main > header, main > section > header").first();
    const before = await header.boundingBox();
    const content = page.locator('[data-slot="scroll-area-viewport"]').first();
    await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await header.boundingBox()).toEqual(before);
    await expectFixedDocument(page);
  }
});

test("short entry screens retain access to the expanded install guide without document scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await openLearnerPage(page, "/");
  await page.getByText("설치 및 온라인 이용 안내", { exact: true }).click();
  await page.getByText(/iPhone.*Safari/).scrollIntoViewIfNeeded();
  await expect(page.getByText(/iPhone.*Safari/)).toBeInViewport();
  await expectFixedDocument(page);
  await page.getByLabel("베타 비밀번호").fill("integration-beta-password");
  await page.getByRole("button", { name: "입장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/languages$/);
});

test("practice keeps its bottom controls stationary while long subtitles scroll", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=1");
  const footer = page.locator("main > footer");
  await expect(footer).toBeVisible();
  const before = (await footer.boundingBox())!;
  expect(before.y + before.height).toBe(600);
  await page.mouse.move(210, 350);
  await page.mouse.wheel(0, 900);
  await expectFixedDocument(page);
  expect(await footer.boundingBox()).toEqual(before);
});
