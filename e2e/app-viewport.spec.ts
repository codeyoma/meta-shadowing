import { expect, test, type Page } from "@playwright/test";

async function expectFixedDocument(page: Page) {
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth <= innerWidth,
    height: document.documentElement.scrollHeight <= innerHeight,
    top: window.scrollY
  }))).toEqual({ width: true, height: true, top: 0 });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 568, height: 320 }, { width: 667, height: 375 }, { width: 932, height: 430 }, { width: 1280, height: 900 }]) {
  test(`stage scrolling keeps the document and lesson header stationary at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
    await page.goto("/setup?lesson=morning-routine");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expectFixedDocument(page);
    await expect(page.getByRole("radio", { name: /^1 자막 쉐도잉/ })).toBeInViewport({ ratio: 0.999 });
    const before = await heading.boundingBox();
    const last = page.getByRole("radio", { name: /16 속사포 한글/ });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ ratio: 1 });
    expect(await heading.boundingBox()).toEqual(before);
    const viewportElement = page.getByRole("region", { name: "학습 단계 목록", exact: true });
    expect(await viewportElement.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expectFixedDocument(page);
    await last.click();
    const popup = page.getByRole("dialog", { name: "속사포 한글", exact: true });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport();
    const box = (await popup.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press("Escape");
    await expect(last).toBeFocused();
    await expectFixedDocument(page);
    // A middle node must leave a usable reading area, even in short landscape.
    await page.getByRole("radio", { name: /^3 순간 암기/ }).click();
    const preview = page.getByRole("dialog", { name: "순간 암기", exact: true });
    await expect(preview.getByRole("heading", { name: "순간 암기", exact: true })).toBeInViewport({ ratio: 0.999 });
    const readingArea = preview.getByRole("region", { name: "스테이지 안내", exact: true });
    expect(await readingArea.evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(64);
    const description = preview.locator("#stage-3-description");
    await description.scrollIntoViewIfNeeded();
    // Allow subpixel intersection rounding at mobile device scale factors.
    await expect(description).toBeInViewport({ ratio: 0.999 });
    await expect(preview.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport({ ratio: 0.999 });
    await expectFixedDocument(page);
  });
}

test("home and administrator screens scroll their content without moving their navigation", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.request.post("/api/admin/auth/verify", { data: { email: "admin@example.com", token: "123456" } });
  for (const route of ["/home", "/admin", "/admin/lessons", "/admin/settings"]) {
    await page.goto(route);
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
  await page.goto("/");
  await page.getByText("설치 및 온라인 이용 안내", { exact: true }).click();
  await page.getByText(/iPhone.*Safari/).scrollIntoViewIfNeeded();
  await expect(page.getByText(/iPhone.*Safari/)).toBeInViewport();
  await expectFixedDocument(page);
  await page.getByLabel("베타 비밀번호").fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/languages$/);
});

test("practice keeps its bottom controls stationary while long subtitles scroll", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=daily-conversation&level=1");
  const footer = page.locator("main > footer");
  await expect(footer).toBeVisible();
  const before = (await footer.boundingBox())!;
  expect(before.y + before.height).toBe(600);
  await page.mouse.move(210, 350);
  await page.mouse.wheel(0, 900);
  await expectFixedDocument(page);
  expect(await footer.boundingBox()).toEqual(before);
});
