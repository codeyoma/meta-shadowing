import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
});

test("stored section and phrase totals reach lesson cards, stages, and the player", async ({ page }) => {
  await page.goto("/lessons?language=english");
  const lesson = page.getByRole("link", { name: /Daily Conversation/ });
  await expect(lesson).toContainText("2개 섹션 · 10개 프레이즈");
  await expect(page.getByRole("link", { name: /Morning Routine/ })).toContainText("0개 섹션 · 3개 프레이즈");
  await lesson.click();
  await expect(page).toHaveURL(/\/lessons\/daily-conversation\/stages$/);
  await expect(page.locator('[aria-labelledby="setup-title"]').getByText("2개 섹션 · 10개 프레이즈", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "현재 스테이지 1 시작" }).click();
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.locator("#player-menu-description")).toHaveText("Daily Conversation · 2개 섹션 · 10개 프레이즈");
});

test("section toggles preserve current focus, sentence selection, and reopened defaults", async ({ page }) => {
  await page.goto("/player?lesson=daily-conversation&level=1&mode=manual");
  const menu = page.getByRole("dialog", { name: "문장 목록", exact: true });
  async function openSentences() {
    await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  }
  await openSentences();
  const home = menu.getByRole("button", { name: /At home/ });
  const work = menu.getByRole("button", { name: /At work/ });
  await expect(home).toHaveAttribute("aria-expanded", "true");
  await expect(work).toHaveAttribute("aria-expanded", "false");
  await expect(menu.getByRole("button", { name: /^1번 문장/ })).toBeFocused();
  await expect(menu.getByRole("button", { name: /번 문장/ })).toHaveCount(7);
  await work.focus();
  await page.keyboard.press("Enter");
  await expect(work).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("button", { name: /번 문장/ })).toHaveCount(10);
  await expect.poll(() => menu.evaluate(element => element.scrollTop)).toBe(0);
  const heading = menu.getByRole("heading", { name: "문장 목록", exact: true });
  await expect(heading).toBeInViewport();
  await menu.getByRole("button", { name: /^9번 문장/ }).click();
  await expect(menu).toHaveCount(0);
  await openSentences();
  await expect(home).toHaveAttribute("aria-expanded", "false");
  await expect(work).toHaveAttribute("aria-expanded", "true");
  const current = menu.getByRole("button", { name: /^9번 문장/ });
  await expect(current).toHaveAttribute("aria-current", "true");
  await expect(current).toBeFocused();
  await expect(current).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await work.click();
  await expect(work).toHaveAttribute("aria-expanded", "false");
  await expect(current).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeFocused();
});

test("switching sections in a short viewport scrolls only the list, never the drawer header", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.goto("/player?lesson=daily-conversation&level=1&mode=manual");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "문장 목록", exact: true });
  const home = menu.getByRole("button", { name: /At home/ });
  const work = menu.getByRole("button", { name: /At work/ });
  await home.click();
  await expect(home).toHaveAttribute("aria-expanded", "false");
  await work.click();
  await expect(work).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => menu.evaluate(element => element.scrollTop)).toBe(0);
  await expect(menu.getByRole("heading", { name: "문장 목록", exact: true })).toBeInViewport();
});
